import { cmsTest as test, expect } from "../../fixtures/test";

test.describe("CMS authenticated access", () => {
    test("lands on an authenticated screen", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");
        // Confirm we're past the sign-in screen (auth persisted from global setup).
        await expect(page.getByRole("heading", { name: /sign in/i })).toHaveCount(0);
    });

    test("shows navigation after auth", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");
        await expect(page.getByRole("navigation").first()).toBeVisible();
    });
});
