import { expect, type Page, type WebSocketRoute } from "@playwright/test";
import { readStoredSession, type ClientTarget, type ProviderConfig } from "./idp";
import { readActiveProviderId } from "./loginFlow";
import { waitForAccessMap } from "./readiness";

const EXPIRY_TIMEOUT = 30_000;
const RETRY_TIMEOUT = 30_000;

/**
 * Drives the stale-token reconnect with the token endpoint unreachable, and
 * asserts the client holds on to the session.
 *
 * A refresh that never got a reply says nothing about whether the credentials
 * are still valid, so signing the user out here would end the session of
 * someone whose refresh token was fine — which is what a network blip or a
 * provider outage looks like from the client.
 *
 * Call after `loginAs(..., { expiresInSeconds })` and before any navigation:
 * the request routing has to be in place before the page boots.
 */
export async function assertSessionSurvivesUnreachableProvider(
    page: Page,
    options: {
        target: ClientTarget;
        provider: ProviderConfig & { origin: string };
        /** Groups the persona's access map should carry once it lands. */
        expectedGroups: string[];
    },
): Promise<void> {
    const { provider } = options;

    // Fail the refresh grant the way a dropped connection would — no HTTP
    // status, no OAuth error body, nothing the client could read as a refusal.
    let refreshAttempts = 0;
    await page.route(`${provider.origin}/oauth/token`, async (route) => {
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
    expect(Object.keys(accessMap)).toEqual(expect.arrayContaining(options.expectedGroups));

    // Wait out the token's life, polled from Node so both the stored expiry and
    // the deadline are read off one clock.
    const expiryDeadline = Date.now() + EXPIRY_TIMEOUT;
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

    // The API rejects the stale token, so recovery must at least be attempted...
    await expect.poll(() => refreshAttempts, { timeout: RETRY_TIMEOUT }).toBeGreaterThan(0);
    // ...and must be retried rather than abandoned after the first failure.
    await expect.poll(() => refreshAttempts, { timeout: RETRY_TIMEOUT }).toBeGreaterThan(1);

    // The session is untouched: same refresh token, provider still selected, and
    // no re-login UI anywhere.
    const kept = await readStoredSession(page, provider);
    expect(kept?.refreshToken).toBe(stale.refreshToken);
    expect(await readActiveProviderId(page, options.target)).toBe(provider._id);
    await expect(page.getByRole("heading", { name: /sign in/i })).toHaveCount(0);
    expect(page.url()).not.toContain(provider.domain);
}
