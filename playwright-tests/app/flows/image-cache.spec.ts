import { appTest as test, expect } from "../../fixtures/test";

const IMAGE_CACHE = "external-images";

/**
 * Returns the URLs currently stored in the named Cache Storage cache.
 * Uses an explicit page.evaluate so we can poll without the test runner
 * complaining about cross-context references.
 */
async function listCachedUrls(
    page: import("@playwright/test").Page,
    cacheName: string,
): Promise<string[]> {
    return page.evaluate(async (name) => {
        if (typeof caches === "undefined") return [];
        if (!(await caches.has(name))) return [];
        const cache = await caches.open(name);
        const keys = await cache.keys();
        return keys.map((req) => req.url);
    }, cacheName);
}

async function clearAllCaches(page: import("@playwright/test").Page) {
    await page.evaluate(async () => {
        if (typeof caches === "undefined") return;
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
    });
}

async function waitForServiceWorker(page: import("@playwright/test").Page) {
    await page
        .evaluate(async () => {
            if (!("serviceWorker" in navigator)) return;
            await navigator.serviceWorker.ready;
        })
        .catch(() => {
            // The PWA registers on first load; in incognito or first-run
            // environments it may not be ready yet. Caller polls cache state.
        });
}

test.describe("App image caching", () => {
    test("populates external-images cache on first visit", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await waitForServiceWorker(page);
        await clearAllCaches(page);

        // Reload so the now-running SW intercepts the fresh image requests.
        await page.reload({ waitUntil: "networkidle" });
        await waitForServiceWorker(page);

        // Make sure at least one rendered image actually loaded.
        const firstImage = page.locator("img").first();
        await expect(firstImage).toBeVisible({ timeout: 30_000 });
        const dimensions = await firstImage.evaluate((el: HTMLImageElement) => ({
            naturalWidth: el.naturalWidth,
            naturalHeight: el.naturalHeight,
        }));
        expect(dimensions.naturalWidth).toBeGreaterThan(0);

        const isImageUrl = (url: string) => /\.(?:png|jpe?g|svg|gif|webp)(?:\?|$)/i.test(url);

        await expect
            .poll(
                async () => (await listCachedUrls(page, IMAGE_CACHE)).filter(isImageUrl).length,
                { timeout: 30_000 },
            )
            .toBeGreaterThan(0);
    });

    test("serves images from cache on a second visit while offline", async ({ page, context }) => {
        await page.goto("/", { waitUntil: "networkidle" });
        await waitForServiceWorker(page);
        const firstImage = page.locator("img").first();
        await expect(firstImage).toBeVisible({ timeout: 30_000 });

        // Confirm something was actually cached before going offline.
        const isImageUrl = (url: string) => /\.(?:png|jpe?g|svg|gif|webp)(?:\?|$)/i.test(url);
        await expect
            .poll(
                async () => (await listCachedUrls(page, IMAGE_CACHE)).filter(isImageUrl).length,
                { timeout: 30_000 },
            )
            .toBeGreaterThan(0);

        // Track network failures during the offline reload — Workbox CacheFirst
        // should serve the cached image without ever hitting the network.
        const networkFailures: string[] = [];
        const onRequestFailed = (req: import("@playwright/test").Request) => {
            if (req.resourceType() === "image") networkFailures.push(req.url());
        };
        page.on("requestfailed", onRequestFailed);

        await context.setOffline(true);
        await page.reload({ waitUntil: "domcontentloaded" });

        await expect(firstImage).toBeVisible({ timeout: 30_000 });
        const dimensions = await firstImage.evaluate((el: HTMLImageElement) => ({
            naturalWidth: el.naturalWidth,
        }));
        expect(dimensions.naturalWidth).toBeGreaterThan(0);

        page.off("requestfailed", onRequestFailed);
        await context.setOffline(false);

        // Image requests for cached URLs should not have failed at the network
        // layer. (Other resources may legitimately fail offline; we only care
        // about images.)
        expect(
            networkFailures,
            "image requests failed offline despite Cache Storage entries",
        ).toEqual([]);
    });
});
