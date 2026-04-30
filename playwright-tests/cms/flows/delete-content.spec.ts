import { cmsTest as test, expect } from "../../fixtures/test";
import { readDoc, readLocalChangesForDoc } from "../../fixtures/db";
import { createTestPost, expectSuccessToast } from "../../fixtures/cms-content";

const DROPDOWN_TRIGGER = '[data-test="dropdown-trigger"]:visible';
const DELETE_BUTTON = '[data-test="delete-button"]:visible';
const MODAL_PRIMARY = '[data-test="modal-primary-button"]:visible';

test.describe("CMS delete content flow", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" });
    });

    test("deletes a post via the editor's delete dialog", async ({ page }) => {
        // Create a throwaway post we own, so the test never touches prod content.
        const stamp = Date.now();
        const { parentId, languageCode } = await createTestPost(page, {
            title: `e2e delete ${stamp}`,
            slug: `e2e-delete-${stamp}`,
        });

        // Wait for the create's localChanges to drain so the delete is the
        // only pending change while we observe.
        await expect
            .poll(() => readLocalChangesForDoc(page, parentId), { timeout: 30_000 })
            .toEqual([]);

        // The editor URL is already at the new parent — open the delete modal.
        await page.locator(DROPDOWN_TRIGGER).click();
        await page.locator(DELETE_BUTTON).click();
        await page.locator(MODAL_PRIMARY).click();

        await expectSuccessToast(page, /deleted/i);

        // Router pushes back to the overview after delete.
        await page.waitForURL(/\/post\/overview\/blog/, { timeout: 15_000 });

        // Once the delete request drains, the parent doc is gone from the local DB.
        await expect
            .poll(() => readLocalChangesForDoc(page, parentId), { timeout: 30_000 })
            .toEqual([]);
        await expect
            .poll(() => readDoc(page, parentId), { timeout: 10_000 })
            .toBeNull();

        // Sanity: the deleted post should not appear in the visible content table.
        const row = page
            .locator('[data-test="content-row"]')
            .filter({ hasText: `e2e delete ${stamp}` });
        await expect(row).toHaveCount(0);

        // Also confirm `languageCode` is the same as we used (param-pass sanity).
        expect(languageCode).toBe("eng");
    });
});
