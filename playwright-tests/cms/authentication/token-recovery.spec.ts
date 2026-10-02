import { cmsPersonaTest as test, expect, providerConfig } from "../../fixtures/persona";
import { readStoredSession } from "../../fixtures/idp";
import { waitForAccessMap } from "../../fixtures/readiness";
import { useShortLivedLiveStream } from "../../fixtures/liveStream";

/**
 * The token only turns bad on the wire at a live-stream *reconnect* — the client
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

        // Live streams end shortly after opening, the way a network drop would
        await useShortLivedLiveStream(page);

        await page.goto("/");
        const accessMap = await waitForAccessMap(page);
        expect(Object.keys(accessMap)).toEqual(expect.arrayContaining(persona.reaches));

        const stale = await readStoredSession(page, provider);
        if (!stale) throw new Error("No stored session to compare against");

        // The refresh itself is the proof of the chain: with automaticSilentRenew
        // off and the token still valid at boot, the connect_error handler is the
        // only code path that can renew the session from here. Reconnects are
        // ~1s apart, so the refresh can land right after expiry; the stale token
        // is therefore not observable and the new one is polled for directly.
        const recoveryDeadline = Date.now() + 45_000;
        let recovered: Awaited<ReturnType<typeof readStoredSession>> = null;
        for (;;) {
            recovered = await readStoredSession(page, provider);
            if (
                recovered &&
                recovered.accessToken !== stale.accessToken &&
                recovered.expiresAt >= stale.expiresAt + 60
            ) {
                break;
            }
            if (Date.now() >= recoveryDeadline) {
                throw new Error(
                    "Session was not silently refreshed after the rejected reconnect " +
                        `(stored expiry ${recovered?.expiresAt ?? "none"}, original ${stale.expiresAt})`,
                );
            }
            await page.waitForTimeout(250);
        }
        // Renewing before the original token expired would not exercise the rejection path
        expect(Date.now()).toBeGreaterThanOrEqual(stale.expiresAt * 1000);

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