import { cmsTest as test, expect } from "../../fixtures/test";
import { readDoc, readLocalChangesForDoc } from "../../fixtures/db";
import { deleteTestPost, expectSuccessToast } from "../../fixtures/cms-content";

const SAVE = '[data-test="save-button"]:visible';
const TITLE_INPUT = 'input[name="title"]';
const SLUG_SPAN = '[data-test="slugSpan"]';
const SLUG_INPUT = 'input[name="slug"]';

test.describe("CMS create content flow", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" });
    });

    test("creates a new blog post and persists it via the API", async ({ page }) => {
        const stamp = Date.now();
        const title = `e2e create ${stamp}`;
        const slug = `e2e-create-${stamp}`;

        await page.goto("/post/edit/blog/new/eng", { waitUntil: "domcontentloaded" });

        // New post has no translations yet — pick English so the editor mounts.
        await page.getByRole("button", { name: "Add translation" }).first().click();
        await page.locator('[data-test="select-language-eng"]:visible').first().click();

        const titleInput = page.locator(TITLE_INPUT);
        await titleInput.waitFor({ state: "visible", timeout: 30_000 });
        await titleInput.fill(title);

        await page.locator(SLUG_SPAN).click();
        const slugInput = page.locator(SLUG_INPUT);
        await slugInput.waitFor({ state: "visible", timeout: 5_000 });
        await slugInput.fill(slug);
        await titleInput.click(); // blur to commit

        // The route's id segment is rewritten to the assigned UUID once a
        // language resolves — capture before save so we can poll the queue
        // by id even if a redirect interleaves with the save click.
        await page.waitForURL(/\/post\/edit\/blog\/(?!new\/)[a-z0-9-]+\/eng/, {
            timeout: 30_000,
        });
        const segments = new URL(page.url()).pathname.split("/").filter(Boolean);
        const parentId = segments[3];
        expect(parentId).toMatch(/^[0-9a-z-]{8,}$/);

        await page.locator(SAVE).click();
        await expectSuccessToast(page, /saved/i);

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
