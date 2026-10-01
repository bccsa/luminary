import type { Page, Response } from "@playwright/test";
import { appPageTest as test, expect, expectPageReady, viewports } from "../../fixtures/pageLoads";

const routes = ["/", "/explore", "/watch", "/search", "/bookmarks", "/settings"] as const;
type AppRoute = (typeof routes)[number];

function expectSuccessfulResponse(response: Response | null) {
    expect(response, "Navigation should return an HTML response").not.toBeNull();
    expect(response!.ok(), `Navigation returned HTTP ${response!.status()}`).toBe(true);
}

async function expectPageLoaded(page: Page, route: AppRoute) {
    await expect(page).toHaveURL((url) => url.pathname === route);
    // A visible shell alone can pass while a lazy route or boot is still stuck.
    await expectPageReady(page);
    const main = page.getByRole("main");
    await expect(main).toBeVisible();

    switch (route) {
        case "/search":
            await expect(main.getByRole("combobox")).toBeVisible();
            await expect(main.getByRole("combobox")).toBeEditable();
            break;
        case "/bookmarks":
            await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
            break;
        case "/settings":
            await expect(main.locator('[data-test="deleteLocalDatabase"]')).toBeVisible();
            break;
        default:
            // Feeds may legitimately be empty (the local seed has no videos).
            // The desktop sidebar uses custom RouterLinks without aria-current.
            // The URL and completed render state above establish the active route.
            await expect(
                page.locator(`a[href="${route}"]:visible`).first(),
            ).toBeVisible();
    }
}

test.describe("App page loads", () => {
    for (const viewport of viewports) {
        test.describe(viewport.name, () => {
            test.use({ viewport: { width: viewport.width, height: viewport.height } });

            for (const route of routes) {
                test(`loads ${route} directly and after a reload`, async ({ page }) => {
                    expectSuccessfulResponse(
                        await page.goto(route, { waitUntil: "domcontentloaded" }),
                    );
                    await expectPageLoaded(page, route);

                    expectSuccessfulResponse(await page.reload({ waitUntil: "domcontentloaded" }));
                    await expectPageLoaded(page, route);
                });
            }

            test("loads feeds through navigation and browser history", async ({ page }) => {
                await page.goto("/", { waitUntil: "domcontentloaded" });
                await expectPageLoaded(page, "/");

                for (const route of ["/explore", "/watch", "/"] as const) {
                    await page.locator(`a[href="${route}"]:visible`).first().click();
                    await expectPageLoaded(page, route);
                }

                await page.goBack();
                await expectPageLoaded(page, "/watch");
                await page.goForward();
                await expectPageLoaded(page, "/");
            });
        });
    }
});
