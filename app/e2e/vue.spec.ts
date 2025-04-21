import { test, expect } from "@playwright/test";

// Leaving link in file for reference to Playwright documentation
// https://playwright.dev/docs/intro

test("syncs correct document types", async ({ page }) => {
    await page.goto("/");
    await page.reload({ waitUntil: "networkidle" });

    await page.waitForTimeout(3000);

    console.log(page.url());
    console.log(await page.title());
});
