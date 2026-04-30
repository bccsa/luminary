import { cmsTest as test, expect } from "../../fixtures/test";
import { findContentByParent, listLanguageCodes, readLocalChangesForDoc } from "../../fixtures/db";
import { createTestPost, deleteTestPost, expectSuccessToast } from "../../fixtures/cms-content";

const SAVE = '[data-test="save-button"]:visible';
const TITLE_INPUT = 'input[name="title"]';

test.describe("CMS translate content flow", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" });
    });

    test("adds a translation in a new language", async ({ page }) => {
        const stamp = Date.now();
        const { parentId } = await createTestPost(page, {
            title: `e2e translate ${stamp}`,
            slug: `e2e-translate-${stamp}`,
        });

        // Wait for the create to drain so subsequent assertions only see the
        // translation's queue entries.
        await expect
            .poll(() => readLocalChangesForDoc(page, parentId), { timeout: 30_000 })
            .toEqual([]);

        const candidates = await listLanguageCodes(page, ["eng"]);
        test.skip(
            candidates.length === 0,
            "test environment has only one language synced — cannot exercise translation flow",
        );
        const targetLanguage = candidates[0];

        // Open the translation picker. Multiple add-translation buttons may be
        // on screen — first visible one is fine.
        await page.getByRole("button", { name: "Add translation" }).first().click();
        await page
            .locator(`[data-test="select-language-${targetLanguage}"]:visible`)
            .first()
            .click();

        // The picker navigates to the new language; the editor mounts a fresh
        // content doc. Title pre-fills with "Translation for <lang>" — replace it.
        const titleInput = page.locator(TITLE_INPUT);
        await titleInput.waitFor({ state: "visible", timeout: 30_000 });
        const translatedTitle = `e2e translate ${stamp} (${targetLanguage})`;
        await titleInput.fill(translatedTitle);

        await page.locator(SAVE).click();
        await expectSuccessToast(page, /saved/i);

        await expect
            .poll(() => readLocalChangesForDoc(page, parentId), { timeout: 30_000 })
            .toEqual([]);

        // The new translation should exist as a content doc under the same parent.
        const translation = await findContentByParent<{
            title: string;
            language: string;
        }>(page, parentId, targetLanguage);
        expect(translation).not.toBeNull();
        expect(translation?.title).toBe(translatedTitle);

        // Cleanup: deleting the parent removes all translations.
        await deleteTestPost(page, parentId);
    });
});
