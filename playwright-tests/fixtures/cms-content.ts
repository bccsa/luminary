import { expect, type Page } from "@playwright/test";

/**
 * Helpers that drive the CMS UI to create and delete throwaway content. Used
 * by flow specs that need a post they own end-to-end (so they can mutate or
 * delete it without touching seeded prod content).
 *
 * These talk to the deployed CMS via the same screens a human would, so they
 * also serve as light coverage of the create/delete flows themselves.
 */

type CreatePostResult = {
    /** The parent post `_id` — the path segment that replaces "new" in the edit URL. */
    parentId: string;
    /** Language code the editor opened in (the route's `:languageCode` param). */
    languageCode: string;
};

type CreatePostOptions = {
    title: string;
    /**
     * Optional explicit slug. If omitted, the CMS auto-generates one from the
     * title; pass an explicit value when a test needs a stable, unique slug.
     */
    slug?: string;
    /** Defaults to `blog`. Pass `event` etc. to test other post types. */
    tagOrPostType?: string;
    /** Defaults to `eng`. */
    languageCode?: string;
};

const SAVE_BUTTON = '[data-test="save-button"]:visible';
const DROPDOWN_TRIGGER = '[data-test="dropdown-trigger"]:visible';
const DELETE_BUTTON = '[data-test="delete-button"]:visible';
const MODAL_PRIMARY = '[data-test="modal-primary-button"]:visible';

/**
 * Create a post via the CMS new-document route. Returns the assigned parent
 * id once the editor URL has rotated from `/new/` to a real UUID and the
 * change has been queued (or pushed) to the API.
 */
export async function createTestPost(
    page: Page,
    opts: CreatePostOptions,
): Promise<CreatePostResult> {
    const tagOrPostType = opts.tagOrPostType ?? "blog";
    const languageCode = opts.languageCode ?? "eng";

    await page.goto(`/post/edit/${tagOrPostType}/new/${languageCode}`, {
        waitUntil: "domcontentloaded",
    });

    // New posts have no translations yet; the editor shows an "Add translation"
    // empty state. Pick the language matching the URL so EditContentBasic mounts.
    const titleInput = page.locator('input[name="title"]');
    const titleVisible = await titleInput
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);

    if (!titleVisible) {
        await page.getByRole("button", { name: "Add translation" }).first().click();
        await page
            .locator(`[data-test="select-language-${languageCode}"]:visible`)
            .first()
            .click();
        await titleInput.waitFor({ state: "visible", timeout: 30_000 });
    }

    await titleInput.fill(opts.title);

    if (opts.slug) {
        await page.locator('[data-test="slugSpan"]').click();
        const slugInput = page.locator('input[name="slug"]');
        await slugInput.waitFor({ state: "visible", timeout: 5_000 });
        await slugInput.fill(opts.slug);
        await titleInput.click(); // blur to commit
    }

    // The new-document flow rewrites the URL from "new" to the assigned UUID
    // as soon as a language resolves, so capture it before saving.
    await page.waitForURL(
        new RegExp(`/post/edit/${tagOrPostType}/(?!new/)[a-z0-9-]+/${languageCode}`),
        { timeout: 30_000 },
    );
    const segments = new URL(page.url()).pathname.split("/").filter(Boolean);
    const parentId = segments[3];
    if (!parentId || parentId === "new") {
        throw new Error(`createTestPost: could not extract parent id from URL ${page.url()}`);
    }

    await page.locator(SAVE_BUTTON).click();

    return { parentId, languageCode };
}

/**
 * Delete a post via the CMS UI. Best-effort: swallows errors so it can be
 * called from `afterEach` cleanup paths even when the test under inspection
 * already failed. Asserts only that the modal opened — confirmation, not
 * post-deletion semantics, is what we're verifying for cleanup.
 */
export async function deleteTestPost(
    page: Page,
    parentId: string,
    opts: { tagOrPostType?: string; languageCode?: string } = {},
): Promise<void> {
    const tagOrPostType = opts.tagOrPostType ?? "blog";
    const languageCode = opts.languageCode ?? "eng";

    try {
        await page.goto(`/post/edit/${tagOrPostType}/${parentId}/${languageCode}`, {
            waitUntil: "domcontentloaded",
        });

        // If the editor never mounts (e.g. the doc was already deleted) bail out cleanly.
        const titleInput = page.locator('input[name="title"]');
        const visible = await titleInput
            .waitFor({ state: "visible", timeout: 10_000 })
            .then(() => true)
            .catch(() => false);
        if (!visible) return;

        await page.locator(DROPDOWN_TRIGGER).click();
        await page.locator(DELETE_BUTTON).click();
        await page.locator(MODAL_PRIMARY).click();

        // Best-effort wait for the navigation back to overview.
        await page
            .waitForURL(new RegExp(`/post/overview/${tagOrPostType}`), { timeout: 15_000 })
            .catch(() => {});
    } catch {
        // Cleanup must not mask the test's primary failure.
    }
}

/**
 * Wait for the success notification toast to appear with a matching title.
 * Uses the `aria-live="assertive"` region the notification manager renders
 * into.
 */
export async function expectSuccessToast(page: Page, titlePattern: RegExp): Promise<void> {
    const toast = page.locator('[aria-live="assertive"]').getByText(titlePattern);
    await expect(toast).toBeVisible({ timeout: 10_000 });
}
