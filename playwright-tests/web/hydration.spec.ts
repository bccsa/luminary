import { test, expect, type Page, type Route } from "@playwright/test";
import { SEEDED, SEED_ARTICLE } from "../fixtures/ssgOutput";

const API_ORIGIN = new URL(process.env.E2E_API_URL ?? "http://localhost:3000").origin;

/** Routes the shell links to that are not content slugs. */
const NON_CONTENT_PATHS = new Set([
    "/",
    "/explore",
    "/watch",
    "/search",
    "/404",
    "/open",
    "/settings",
    "/bookmarks",
]);

/**
 * Vue only mounts once the entry module has run, so this is the point after which
 * the DOM is the client's rather than the prerender's.
 */
async function waitForHydration(page: Page): Promise<void> {
    await page.waitForFunction(
        () => !!(document.querySelector("#app") as { __vue_app__?: unknown } | null)?.__vue_app__,
        undefined,
        { timeout: 30_000 },
    );
}

/**
 * Cut the page off from the API so nothing but the prerendered HTML and its
 * first-paint cache seed can put content on screen.
 */
async function blockApi(page: Page): Promise<void> {
    await page.route(
        (url) => url.origin === API_ORIGIN,
        (route: Route) => route.abort(),
    );
}

/** Content-slug links the prerender emitted on a page, read from the static HTML. */
async function prerenderedContentLinks(page: Page, route: string): Promise<string[]> {
    const html = await page.request.get(route).then((r) => r.text());
    const hrefs = [...html.matchAll(/href="(\/[^/"?#]+)"/g)].map((m) => m[1]);
    return [...new Set(hrefs)].filter((href) => !NON_CONTENT_PATHS.has(href));
}

test.describe("Hydration", () => {
    test.skip(!SEEDED, "Route-level expectations depend on the local stack's seed corpus.");

    test("hydrates without mismatches or page errors", async ({ page }) => {
        const hydrationWarnings: string[] = [];
        const pageErrors: string[] = [];

        // `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` is on for this build, so mismatches
        // surface as console warnings rather than being patched silently.
        page.on("console", (msg) => {
            if (/hydrat/i.test(msg.text())) hydrationWarnings.push(msg.text());
        });
        page.on("pageerror", (error) => pageErrors.push(error.message));

        for (const route of ["/", "/explore", "/watch", `/${SEED_ARTICLE.slug}`]) {
            await page.goto(route);
            await waitForHydration(page);
            await page.waitForLoadState("networkidle");
        }

        expect(hydrationWarnings).toEqual([]);
        expect(pageErrors).toEqual([]);
    });

    test("keeps prerendered feed content on screen through hydration", async ({ page }) => {
        const links = await prerenderedContentLinks(page, "/");
        expect(links.length, "the prerendered home page linked no content").toBeGreaterThan(0);

        // With the API unreachable, only the inline `hqcache:` seed can carry the tiles
        // across hydration — this is the flash the seed exists to prevent.
        await blockApi(page);
        await page.goto("/");
        await waitForHydration(page);

        await expect(page.locator(`a[href="${links[0]}"]`).first()).toBeVisible();

        // Content that survives hydration but disappears a beat later is still a flash.
        await page.waitForTimeout(2000);
        await expect(page.locator(`a[href="${links[0]}"]`).first()).toBeVisible();
    });

    test("recovers the article body the cache seed omits", async ({ page }) => {
        // `ssrCacheStripFields: ["text"]` keeps the body out of the seed, so after
        // hydration it can only come back via the `[data-ssr-article-text]` marker.
        await blockApi(page);
        await page.goto(`/${SEED_ARTICLE.slug}`);
        await waitForHydration(page);

        await expect(page.getByRole("heading", { name: SEED_ARTICLE.title }).first()).toBeVisible();
        await expect(page.locator("article")).toContainText(SEED_ARTICLE.bodyPhrase);

        await page.waitForTimeout(2000);
        await expect(page.locator("article")).toContainText(SEED_ARTICLE.bodyPhrase);
    });

    test("boots the web client entry, not the SPA entry", async ({ page }) => {
        await page.goto("/");
        await waitForHydration(page);
        await page.waitForLoadState("networkidle");

        const registrations = await page.evaluate(async () => {
            if (!("serviceWorker" in navigator)) return 0;
            return (await navigator.serviceWorker.getRegistrations()).length;
        });
        expect(registrations, "the web tier must register no service worker").toBe(0);
    });

    test("routes client-side once hydrated", async ({ page }) => {
        await page.goto(`/${SEED_ARTICLE.slug}`);
        await waitForHydration(page);

        await page.locator('a[href="/explore"]').first().click();
        await expect(page).toHaveURL(/\/explore$/);
        await expect(page.getByRole("main")).toBeVisible();

        // A client-side navigation with no full document load means the router took over.
        await expect(page.locator("article")).toHaveCount(0);
    });
});
