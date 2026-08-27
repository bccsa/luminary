import { appTest as test, expect } from "../../fixtures/test";
import { waitForSynced } from "../../fixtures/readiness";

test.describe("App home page", () => {
    test("loads the home page", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("banner")).toBeVisible();
        await expect(page.getByRole("main")).toBeVisible();
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
