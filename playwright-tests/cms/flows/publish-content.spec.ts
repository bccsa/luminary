import { cmsTest as test, expect } from "../../fixtures/test";
import { findContentByParent, readLocalChangesForDoc } from "../../fixtures/db";
import { createTestPost, deleteTestPost, expectSuccessToast } from "../../fixtures/cms-content";

const SAVE = '[data-test="save-button"]:visible';

test.describe("CMS publish content flow", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" });
    });

    test("transitions a draft post to published", async ({ page }) => {
        const stamp = Date.now();
        const { parentId, languageCode } = await createTestPost(page, {
            title: `e2e publish ${stamp}`,
            slug: `e2e-publish-${stamp}`,
        });

        // Wait for the create's queue to drain so the publish save is the only
        // pending change from here on.
        await expect
            .poll(() => readLocalChangesForDoc(page, parentId), { timeout: 30_000 })
            .toEqual([]);

        // Newly created content starts in Draft (PublishStatus.Draft).
        const draft = await findContentByParent<{ _id: string; status: string }>(
            page,
            parentId,
            languageCode,
        );
        expect(draft).not.toBeNull();
        expect(draft?.status).toBe("draft");

        // The "Publishable" button is unique to the status toggle (the other
        // text-toggle on this screen uses Visible/SEO).
        await page.getByRole("button", { name: "Publishable", exact: true }).click();

        await page.locator(SAVE).click();
        await expectSuccessToast(page, /saved/i);

        await expect
            .poll(() => readLocalChangesForDoc(page, parentId), { timeout: 30_000 })
            .toEqual([]);

        // The content doc should now report status=published.
        await expect
            .poll(
                async () => {
                    const c = await findContentByParent<{ status: string }>(
                        page,
                        parentId,
                        languageCode,
                    );
                    return c?.status ?? null;
                },
                { timeout: 30_000 },
            )
            .toBe("published");

        await deleteTestPost(page, parentId);
    });
});
