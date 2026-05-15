import { cmsTest as test, expect } from "../../fixtures/test";
import { readDoc, readLocalChangesForDoc } from "../../fixtures/db";
import { createTestPost, deleteTestPost } from "../../fixtures/cms-content";

test.describe("CMS create content flow", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" });
    });

    test("creates a new blog post and persists it via the API", async ({ page }) => {
        const stamp = Date.now();
        const title = `e2e create ${stamp}`;
        const slug = `e2e-create-${stamp}`;

        const { parentId } = await createTestPost(page, { title, slug });
        expect(parentId).toMatch(/^[0-9a-z-]{8,}$/);

        // The localChanges queue should drain (we're online).
        await expect
            .poll(() => readLocalChangesForDoc(page, parentId), { timeout: 30_000 })
            .toEqual([]);

        // Re-fetch the parent doc from IndexedDB to confirm it persisted.
        const parent = await readDoc<{ _id: string; type: string; memberOf: string[] }>(
            page,
            parentId,
        );
        expect(parent).not.toBeNull();
        expect(parent?.type).toBe("post");

        // Cleanup so subsequent runs don't accumulate test posts.
        await deleteTestPost(page, parentId);
    });
});
