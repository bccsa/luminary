import { cmsPersonaTest as test, expect, providerConfig } from "../../fixtures/persona";
import { readStoredSession } from "../../fixtures/idp";
import { readActiveProviderId } from "../../fixtures/loginFlow";
import { waitForAccessMap } from "../../fixtures/readiness";
import type { WebSocketRoute } from "@playwright/test";

/**
 * The counterpart to quiet token recovery: the same stale-token reconnect, but
 * with the token endpoint unreachable rather than answering. A refresh that
 * never got a reply says nothing about whether the credentials are still valid,
 * so the client must hold on to them and keep trying — signing the user out
 * here would end the session of someone whose refresh token was fine.
 */
test.describe("CMS unreachable provider", () => {
    test("keeps the session and retries when the token endpoint cannot be reached", async ({
        page,
        loginAs,
        idp,
    }) => {
        const provider = providerConfig(idp.providers.primary);
        const persona = await loginAs("editor1", { expiresInSeconds: 12 });

        // Fail the refresh grant the way a dropped connection would — no HTTP
        // status, no OAuth error body, nothing the client could read as a refusal.
        let refreshAttempts = 0;
        await page.route(`${idp.providers.primary.origin}/oauth/token`, async (route) => {
            const params = new URLSearchParams(route.request().postData() ?? "");
            if (params.get("grant_type") !== "refresh_token") {
                await route.continue();
                return;
            }
            refreshAttempts += 1;
            await route.abort("connectionfailed");
        });

        // Keep the server-side handle so the connection can be dropped the way a
        // network blip would, forcing a reconnect with the by-then stale token.
        let serverSide: WebSocketRoute | undefined;
        await page.routeWebSocket(/\/socket\.io\//, (ws) => {
            serverSide = ws.connectToServer();
        });

        await page.goto("/");
        const accessMap = await waitForAccessMap(page);
        expect(Object.keys(accessMap)).toEqual(expect.arrayContaining(persona.reaches));

        // Wait out the token's life, polled from Node so both the stored expiry
        // and the deadline are read off one clock.
        const expiryDeadline = Date.now() + 30_000;
        for (;;) {
            const session = await readStoredSession(page, provider);
            if (session && session.expiresAt * 1000 + 2_000 <= Date.now()) break;
            if (Date.now() >= expiryDeadline) throw new Error("Token never reached its expiry");
            await page.waitForTimeout(250);
        }
        const stale = await readStoredSession(page, provider);
        if (!serverSide || !stale) {
            throw new Error("socket.io never opened a WebSocket; the drop cannot be simulated");
        }

        await serverSide.close();

        // The API rejects the stale token, so recovery must at least be attempted.
        await expect.poll(() => refreshAttempts, { timeout: 20_000 }).toBeGreaterThan(0);

        // It must then retry rather than give up after the first failure.
        await expect.poll(() => refreshAttempts, { timeout: 30_000 }).toBeGreaterThan(1);

        // The session is untouched: same refresh token, provider still selected,
        // and no re-login UI anywhere.
        const kept = await readStoredSession(page, provider);
        expect(kept?.refreshToken).toBe(stale.refreshToken);
        expect(await readActiveProviderId(page, "cms")).toBe(provider._id);
        await expect(page.getByRole("heading", { name: /sign in/i })).toHaveCount(0);
        expect(page.url()).not.toContain(provider.domain);
    });
});
