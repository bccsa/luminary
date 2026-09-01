import { appTest as test, expect } from "../../fixtures/test";
import { waitForSynced } from "../../fixtures/readiness";

test.describe("App home page", () => {
    test("renders the desktop chrome", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" });

        // The mobile top bar is the only `banner` landmark and it is `lg:hidden`,
        // so at the default desktop viewport the sidebar is the page chrome.
        await expect(page.getByRole("main")).toBeVisible();
        await expect(page.getByRole("navigation").first()).toBeVisible();
    });

    test("renders the top bar on a narrow viewport", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/", { waitUntil: "domcontentloaded" });

        await expect(page.getByRole("banner")).toBeVisible();
    });

    test("syncs documents into IndexedDB", async ({ page }) => {
        await page.goto("/");

        const { types } = await waitForSynced(page, { types: ["language", "content"] });
        expect(types).toEqual(expect.arrayContaining(["language", "content"]));
    });

    test("does not sync drafted or expired docs to the client", async ({ page }) => {
        await page.goto("/");

        // Wait for published content to arrive before asserting what did not —
        // an empty database would satisfy the absence checks on its own.
        const { statuses } = await waitForSynced(page, { types: ["content"] });
        expect(statuses).toContain("published");
        expect(statuses).not.toContain("draft");
        expect(statuses).not.toContain("expired");
    });
});
