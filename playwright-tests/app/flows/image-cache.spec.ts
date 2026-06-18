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

async function waitForServiceWorker(page: import("@playwright/test").Page) {
    // navigator.serviceWorker.ready is a promise that *never rejects* — it
    // pends forever if no SW reaches activation. Race it against a hard
    // timeout so the test fails its own assertions rather than blocking
    // page.evaluate until the test runner's 100s cap kicks in and kills the
    // browser (which surfaces as a confusing "Target page closed" error).
    await page
        .evaluate(async () => {
            if (!("serviceWorker" in navigator)) return;
            await Promise.race([
                navigator.serviceWorker.ready,
                new Promise((resolve) => setTimeout(resolve, 10_000)),
            ]);
        })
        .catch(() => {
            // Best effort; caller polls cache state.
        });
}

test.describe("App image caching", () => {
    test("populates external-images cache on first visit", async ({ page }) => {
        // Each Playwright context starts with empty Cache Storage, so we don't
        // need to clear caches up front. The first visit registers the SW; we
        // reload so the now-active SW intercepts and caches the fresh image
        // requests.
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await waitForServiceWorker(page);
        // domcontentloaded — the app keeps a sync socket open, so networkidle
        // may never fire. We poll for cache state below regardless.
        await page.reload({ waitUntil: "domcontentloaded" });
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
        // domcontentloaded (instead of networkidle) — the app keeps a sync
        // socket open which means networkidle may never fire and the goto
        // hangs until the test timeout.
        await page.goto("/", { waitUntil: "domcontentloaded" });
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
