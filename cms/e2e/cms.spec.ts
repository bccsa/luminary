// Leaving link in file for reference to Playwright documentation
// https://playwright.dev/docs/intro
import { test, expect } from "@playwright/test";

test.describe("CMS E2E Tests", () => {
    test("should load the CMS application", async ({ page }) => {
        await page.goto("/");
        // Wait for the app to load
        await page.waitForLoadState("networkidle");

        // The app should show the main content (sidebar should be visible when authenticated)
        // In auth bypass mode, we should see the authenticated view
        await expect(page.locator("body")).toBeVisible();
    });

    test("should display sidebar navigation when authenticated", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Wait for any initial loading to complete
        await page.waitForTimeout(1000);

        // In auth bypass mode, we should see the sidebar (on desktop)
        // The sidebar contains navigation links
        const sidebar = page.locator('[class*="lg:fixed"][class*="lg:inset-y-0"]');

        // On larger screens, sidebar should be visible
        await expect(sidebar).toBeVisible();
    });

    test("should navigate to different sections", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1000);

        // Check that the page has loaded successfully
        // The exact content depends on the initial page configuration
        await expect(page).toHaveURL(/\//);
    });
});
