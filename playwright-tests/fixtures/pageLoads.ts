import { test as base, expect, mergeTests, type Page } from "@playwright/test";
import { appTest } from "./test";
import { appPersonaTest } from "./persona";

// Opt in only: recovery specs elsewhere deliberately cause browser errors.
const browserErrorTest = base.extend<{ browserErrors: undefined }>({
    browserErrors: [
        async ({ page }, use) => {
            const errors: string[] = [];
            const onError = (error: Error) => errors.push(error.stack ?? error.message);
            page.on("pageerror", onError);
            try {
                await use(undefined);
            } finally {
                page.off("pageerror", onError);
                expect(errors, "Uncaught JavaScript errors during page load").toEqual([]);
            }
        },
        { auto: true },
    ],
});

export const appPageTest = mergeTests(appTest, browserErrorTest);
export const seededAppPageTest = mergeTests(appPersonaTest, browserErrorTest);
export { expect };

export const viewports = [
    { name: "desktop", width: 1280, height: 720 },
    { name: "mobile", width: 390, height: 844 },
];

export async function expectPageReady(page: Page) {
    await expect(page.locator("html")).toHaveAttribute("data-render-state", "ready", {
        timeout: 30_000,
    });
    await expect(page.locator("#boot-splash")).toHaveCount(0);
}
