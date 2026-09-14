import { appTest as test, expect } from "../../fixtures/test";
import { waitForSynced } from "../../fixtures/readiness";
import type { Page } from "@playwright/test";

/**
 * The notification store round-trips opted-in banners and their dismissals through
 * localStorage, so a reload must show an ongoing banner straight away rather than
 * waiting out the condition's own delay, and must not resurrect one the user closed.
 */

const SOCKET_IO = /\/socket\.io\//;

/** Covers App.vue's 5s grace period before the offline watcher first runs. */
const BANNER_TIMEOUT = 25_000;

/**
 * Comfortably under that grace period: a banner on screen this soon after the app
 * is ready came out of localStorage, not out of the watcher that raises it.
 */
const RESTORE_TIMEOUT = 3_000;

const NOTIFICATIONS_KEY = "notifications";
const DISMISSED_KEY = "dismissedNotifications";

const banner = (page: Page, id: string) =>
    page.locator(`[data-test="notification-banner"][data-notification-id="${id}"]`);

const closeBanner = async (page: Page, id: string) => {
    await banner(page, id).locator('[data-test="banner-close-button"]').click();
    await expect(banner(page, id)).toHaveCount(0);
};

const readStoredIds = (page: Page, key: string) =>
    page.evaluate((k) => {
        try {
            const list = JSON.parse(localStorage.getItem(k) || "[]");
            return Array.isArray(list) ? list.map((n) => (typeof n === "string" ? n : n?.id)) : [];
        } catch {
            return [];
        }
    }, key);

/** Resolves when the splash screen has cleared and the app has rendered. */
const waitForAppReady = (page: Page) =>
    page.waitForFunction(
        () => document.documentElement.dataset.renderState === "ready",
        undefined,
        {
            timeout: 60_000,
        },
    );

/**
 * Blocks socket.io on both transports so `isConnected` stays false, and hands
 * back a switch to let it through again. Routing has to be installed before the
 * first navigation, and WebSocket routes cannot be removed once added, so
 * connectivity is toggled from inside the handlers rather than by unrouting.
 */
async function interceptConnectivity(page: Page) {
    let online = true;
    await page.routeWebSocket(SOCKET_IO, (ws) => {
        if (online) ws.connectToServer();
        else ws.close();
    });
    await page.route(SOCKET_IO, (route) =>
        online ? route.continue() : route.abort("connectionfailed"),
    );
    return { setOnline: (value: boolean) => (online = value) };
}

/**
 * The splash screen only clears once Language docs are in IndexedDB, so a cold
 * context has to sync online before it can render anything offline.
 */
async function loadOnlineThenGoOffline(page: Page, setOnline: (value: boolean) => void) {
    await page.goto("/");
    await waitForSynced(page, { types: ["language"] });
    setOnline(false);
    await page.reload();
}

test.describe("App notification persistence", () => {
    test("restores the offline banner immediately on the next page load", async ({ page }) => {
        test.setTimeout(150_000);
        const { setOnline } = await interceptConnectivity(page);

        await loadOnlineThenGoOffline(page, setOnline);
        await expect(banner(page, "offlineBanner")).toBeVisible({ timeout: BANNER_TIMEOUT });
        expect(await readStoredIds(page, NOTIFICATIONS_KEY)).toContain("offlineBanner");

        await page.reload();
        await waitForAppReady(page);
        // Still offline, and back on screen well before the watcher would raise it.
        await expect(banner(page, "offlineBanner")).toBeVisible({ timeout: RESTORE_TIMEOUT });
    });

    test("keeps a dismissed offline banner dismissed across a reload", async ({ page }) => {
        test.setTimeout(150_000);
        const { setOnline } = await interceptConnectivity(page);

        await loadOnlineThenGoOffline(page, setOnline);
        await expect(banner(page, "offlineBanner")).toBeVisible({ timeout: BANNER_TIMEOUT });

        await closeBanner(page, "offlineBanner");
        expect(await readStoredIds(page, DISMISSED_KEY)).toContain("offlineBanner");
        expect(await readStoredIds(page, NOTIFICATIONS_KEY)).not.toContain("offlineBanner");

        // Still offline, so the watcher re-raises the banner — the remembered
        // dismissal is the only thing that can keep it off the page.
        await page.reload();
        await page.waitForTimeout(BANNER_TIMEOUT / 2);
        await expect(banner(page, "offlineBanner")).toHaveCount(0);
    });

    test("clears the stored banner and the dismissal once the connection returns", async ({
        page,
    }) => {
        test.setTimeout(150_000);
        const { setOnline } = await interceptConnectivity(page);

        await loadOnlineThenGoOffline(page, setOnline);
        await expect(banner(page, "offlineBanner")).toBeVisible({ timeout: BANNER_TIMEOUT });
        await closeBanner(page, "offlineBanner");

        setOnline(true);
        await page.reload();
        await expect
            .poll(() => readStoredIds(page, DISMISSED_KEY), { timeout: BANNER_TIMEOUT })
            .not.toContain("offlineBanner");
        expect(await readStoredIds(page, NOTIFICATIONS_KEY)).not.toContain("offlineBanner");

        setOnline(false);
        await page.reload();
        await expect(banner(page, "offlineBanner")).toBeVisible({ timeout: BANNER_TIMEOUT });
    });

    test("does not show a stale offline banner on a reload that reconnects", async ({ page }) => {
        test.setTimeout(150_000);
        const { setOnline } = await interceptConnectivity(page);

        await loadOnlineThenGoOffline(page, setOnline);
        await expect(banner(page, "offlineBanner")).toBeVisible({ timeout: BANNER_TIMEOUT });

        // Reload back online without dismissing: the banner may be restored for an
        // instant, but must go as soon as the socket is up rather than lingering for
        // the whole grace period.
        setOnline(true);
        await page.reload();
        await expect(banner(page, "offlineBanner")).toHaveCount(0, { timeout: BANNER_TIMEOUT / 5 });
    });
});
