import type { Page } from "@playwright/test";
import {
    seededAppPageTest as test,
    expect,
    expectPageReady,
    viewports,
} from "../../fixtures/pageLoads";

// These documents come from the local stack seed. No deployment-specific slugs,
// database writes, or mocked content responses are needed.
const ARTICLE = "/blog1-eng";
const MISSING = "/e2e-page-load-missing-2055";

async function expectArticle(page: Page) {
    await expect(page).toHaveURL((url) => url.pathname === ARTICLE);
    await expect(page.locator("article h1:visible")).toHaveText("Blog 1");
    await expect(page.locator("article .prose p").filter({ hasText: "little Lily wept" })).toBeVisible();
    await expectPageReady(page);
    await expect(page.locator('[data-test="login-prompt"]')).toHaveCount(0);
}

async function expectMissing(page: Page, pathname: string) {
    await expect(page).toHaveURL((url) => url.pathname === pathname);
    await expect(page.locator('[data-test="login-prompt"]')).toBeVisible({ timeout: 30_000 });
    await expectPageReady(page);
    await expect(page.locator("article")).toHaveCount(0);
}

test.describe("App page-load recovery", () => {
    for (const viewport of viewports) {
        test.describe(viewport.name, () => {
            test.use({
                viewport: { width: viewport.width, height: viewport.height },
                // Network interception must reach the API instead of a service worker.
                serviceWorkers: "block",
            });

            test("renders article text on a cold deep link and preserves query and hash on reload", async ({ page }) => {
                const path = `${ARTICLE}?nonotifications#article`;
                await page.goto(path, { waitUntil: "domcontentloaded" });
                await expectArticle(page);
                await page.reload({ waitUntil: "domcontentloaded" });
                await expectArticle(page);
                const url = new URL(page.url());
                expect(url.pathname + url.search + url.hash).toBe(path);
            });

            test("shows a missing-slug fallback after an article and restores the article on back", async ({ page }) => {
                await page.goto(ARTICLE);
                await expectArticle(page);
                await page.goto(MISSING);
                await expectMissing(page, MISSING);
                await page.reload();
                await expectMissing(page, MISSING);
                await page.goBack();
                await expectArticle(page);
            });

            test("handles an unmatched nested URL without getting stuck at boot", async ({ page }) => {
                const path = "/e2e-missing/nested/page";
                await page.goto(path);
                await expectMissing(page, path);
                await page.goto(ARTICLE);
                await expectArticle(page);
            });

            test("does not show private article content to a guest after visiting a public article", async ({ page }) => {
                await page.goto(ARTICLE);
                await expectArticle(page);
                await page.goto("/blog2-eng");
                await expectMissing(page, "/blog2-eng");
                await expect(page.getByRole("heading", { name: "Blog 2", exact: true })).toHaveCount(0);
            });

            test("keeps a previously read article available when API requests fail", async ({ page }) => {
                await page.goto(ARTICLE);
                await expectArticle(page);

                let blockedQueries = 0;
                await page.route("**/query", async (route) => {
                    blockedQueries++;
                    await route.abort("connectionrefused");
                });
                await page.reload();
                await expectArticle(page);
                // Prove the failure was exercised, rather than passing from a warm DOM.
                await expect.poll(() => blockedQueries).toBeGreaterThan(0);

                await page.unroute("**/query");
                await page.reload();
                await expectArticle(page);
            });

            test("does not let a delayed missing-slug response replace a newer page", async ({ page }) => {
                let release!: () => void;
                const gate = new Promise<void>((resolve) => { release = resolve; });
                let heldRequests = 0;
                let releasedResponses = 0;
                await page.route("**/query", async (route) => {
                    if (!route.request().postData()?.includes(MISSING.slice(1))) {
                        await route.continue();
                        return;
                    }
                    const response = await route.fetch();
                    heldRequests++;
                    await gate;
                    await route.fulfill({ response });
                    releasedResponses++;
                });

                try {
                    await page.goto(MISSING, { waitUntil: "domcontentloaded" });
                    await expect.poll(() => heldRequests, { timeout: 30_000 }).toBeGreaterThan(0);
                    // A pending lookup must not be mistaken for a confirmed 404.
                    await expect(page.locator('[data-test="login-prompt"]')).toHaveCount(0);
                    await page.locator('a[href="/"]:visible').first().click();
                    await expect(page).toHaveURL((url) => url.pathname === "/");
                    await expectPageReady(page);
                    release();
                    await expect.poll(() => releasedResponses).toBeGreaterThan(0);
                    await expectPageReady(page);
                    await expect(page).toHaveURL((url) => url.pathname === "/");
                    await expect(page.locator('[data-test="login-prompt"]')).toHaveCount(0);
                    // Positive content assertion: a blank shell is not recovery.
                    await expect(page.locator('main a[href="/blog1-eng"]').first()).toBeVisible();
                    await page.locator('main a[href="/blog1-eng"]').first().click();
                    await expectArticle(page);
                } finally {
                    release();
                    await page.unrouteAll({ behavior: "wait" });
                }
            });
        });
    }
});
