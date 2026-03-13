// Leaving link in file for reference to Playwright documentation
// https://playwright.dev/docs/intro
import { test, expect } from "@playwright/test";

const E2E_GROUP_ID = "group-super-admins";

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

        await page.getByRole("link", { name: "Languages" }).click();
        await page.waitForURL(/\/languages/);
        await expect(page).toHaveURL(/\/languages/);
    });

    test("should queue a language change in localChanges when creating a language (offline)", async ({
        page,
    }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1000);

        // Seed group for selector (offline: no API, no setConnected)
        await page.evaluate(async (groupId: string) => {
            const w = (window as unknown as {
                __e2e?: { seedGroup: (g: Record<string, unknown>) => Promise<void> };
            }).__e2e;
            if (!w) return;
            await w.seedGroup({
                _id: groupId,
                type: "group",
                name: "Super Admins",
                updatedTimeUtc: Date.now(),
                acl: [],
            });
        }, E2E_GROUP_ID);

        await page.getByRole("link", { name: "Languages" }).click();
        await page.waitForURL(/\/languages/);
        await page.getByTestId("create-language-btn").click();
        await page.waitForURL(/\/languages\/[^/]+/);

        await page.getByPlaceholder(/enter language name/i).fill("E2E Language");
        await page.getByPlaceholder(/enter language code/i).fill("e2e");

        await page.getByRole("button", { name: "edit" }).click();
        await page.getByRole("dialog").locator("button[name='options-open-btn']").click();
        await page.getByTestId("options").getByText("Super Admins").click();
        await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

        await page.getByTestId("save-button").click();

        await page.waitForTimeout(500);

        const localChanges = await page.evaluate(async () => {
            const w = (window as unknown as {
                __e2e?: { getLocalChanges: () => Promise<Array<{ doc?: { type?: string } }>> };
            }).__e2e;
            if (!w?.getLocalChanges) return [];
            return await w.getLocalChanges();
        });
        expect(localChanges.some((lc) => lc.doc?.type === "language")).toBe(true);
    });
});
