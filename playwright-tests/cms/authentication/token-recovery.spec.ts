import { cmsPersonaTest as test, expect, providerConfig } from "../../fixtures/persona";
import { readStoredSession } from "../../fixtures/idp";
import { waitForAccessMap } from "../../fixtures/readiness";
import type { WebSocketRoute } from "@playwright/test";

/**
 * The token only turns bad on the wire at a socket *reconnect* — the client
 * never refreshes on its own while the tab sits open (`automaticSilentRenew`
 * is off). That is the situation the API's `token_invalid` rejection and the
 * client's `connect_error` recovery exist for, and this covers it live: stale
 * token at handshake, silent refresh, reconnect — all without any re-login UI.
 */
test.describe("CMS quiet token recovery", () => {
    test("a token that goes stale mid-session recovers silently at reconnect", async ({
        page,
        loginAs,
        idp,
    }) => {
        const provider = providerConfig(idp.providers.primary);
        const persona = await loginAs("editor1", { expiresInSeconds: 12 });

        // Pass socket traffic through untouched, but keep the server-side handle
        // so the test can close the connection the way a network drop would.
        let serverSide: WebSocketRoute | undefined;
        await page.routeWebSocket(/\/socket\.io\//, (ws) => {
            serverSide = ws.connectToServer();
        });

        await page.goto("/");
        const accessMap = await waitForAccessMap(page);
        expect(Object.keys(accessMap)).toEqual(expect.arrayContaining(persona.reaches));

        // Wait out the token's life. Polled from Node so the epoch comparison
        // uses one clock for both the stored expiry and the deadline.
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
        const dropEpochSeconds = Math.floor(Date.now() / 1000);

        await serverSide.close();

        // The refresh itself is the proof of the chain: with automaticSilentRenew
        // off and the token still valid at boot, the connect_error handler is the
        // only code path that can renew the session from here.
        const recoveryDeadline = Date.now() + 20_000;
        let recovered: Awaited<ReturnType<typeof readStoredSession>> = null;
        for (;;) {
            recovered = await readStoredSession(page, provider);
            if (
                recovered &&
                recovered.accessToken !== stale.accessToken &&
                recovered.expiresAt >= dropEpochSeconds + 60
            ) {
                break;
            }
            if (Date.now() >= recoveryDeadline) {
                throw new Error(
                    "Session was not silently refreshed after the rejected reconnect " +
                        `(stored expiry ${recovered?.expiresAt ?? "none"}, drop at ${dropEpochSeconds})`,
                );
            }
            await page.waitForTimeout(250);
        }

        // Quiet means the user keeps their session and never sees re-login UI:
        // the fresh handshake must have replaced the access map, not purged it,
        // and the browser must still be on the CMS rather than bounced to the
        // issuer for a visible login.
        const recoveredMap = await waitForAccessMap(page);
        expect(Object.keys(recoveredMap)).toEqual(expect.arrayContaining(persona.reaches));
        await expect(page.getByRole("heading", { name: /sign in/i })).toHaveCount(0);
        expect(page.url()).not.toContain(provider.domain);
        expect(recovered!.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 60);
    });
});