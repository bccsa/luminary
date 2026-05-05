import { expect, type Page } from "@playwright/test";
import { pickDefaultLanguageCode } from "./db";

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
    /** If omitted, uses the first synced language in IndexedDB. */
    languageCode?: string;
};

const SAVE_BUTTON = '[data-test="save-button"]:visible';
const DROPDOWN_TRIGGER = '[data-test="dropdown-trigger"]:visible';
const DELETE_BUTTON = '[data-test="delete-button"]:visible';
const MODAL_PRIMARY = '[data-test="modal-primary-button"]:visible';

/**
 * Open the Group Membership editor and pick the first available group, then
 * close the modal. The CMS only renders the "edit" trigger when at least one
 * assignable group is available, so its absence is fatal — the test user
 * doesn't have the permissions to assign any group and we cannot proceed.
 */
async function assignFirstAvailableGroup(page: Page): Promise<void> {
    const editGroup = page.locator('[data-test="edit-group"]:visible').first();
    await editGroup.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {
        throw new Error(
            "createTestPost: no assignable groups available — the test user lacks " +
                "the Edit/Assign permissions needed to satisfy the API's memberOf constraint.",
        );
    });
    await editGroup.click();

    // The combobox auto-focuses its search input on open; ArrowDown opens the
    // dropdown and highlights the first option.
    const search = page.locator('input[name="option-search"]:visible').first();
    await search.waitFor({ state: "visible", timeout: 10_000 });
    await search.press("ArrowDown");

    const firstOption = page.locator('[data-test="group-selector"]:visible').first();
    await firstOption.waitFor({ state: "visible", timeout: 10_000 });
    await firstOption.click();

    await page.locator(MODAL_PRIMARY).click();
}

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
    const languageCode = opts.languageCode ?? (await pickDefaultLanguageCode(page));
    if (!languageCode) {
        throw new Error(
            "createTestPost: no synced language found in IndexedDB — cannot pick a default. " +
                "Either pass an explicit languageCode or ensure the test environment has at least one language.",
        );
    }

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

    // The API enforces `memberOf.length > 0` for posts; assigning the first
    // available group satisfies that constraint. Without this the save click
    // would surface a "memberOf should not be empty" validation error and the
    // local doc would be rolled back, making downstream IndexedDB lookups fail.
    await assignFirstAvailableGroup(page);

    await page.locator(SAVE_BUTTON).click();
    // Wait for the API to confirm the create — without this, callers race
    // against a save that may still be in flight (or have failed with e.g.
    // "memberOf should not be empty") and observe an inconsistent local DB.
    await expectSuccessToast(page, /saved/i);

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
    const languageCode = opts.languageCode ?? (await pickDefaultLanguageCode(page).catch(() => null));
    if (!languageCode) {
        // Cleanup is best-effort; if we can't even pick a language, bail silently.
        return;
    }

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
    // The notification renders a title and a description, both inside the
    // aria-live region — scope to the first match (the title) so the regex
    // doesn't strict-mode-fail when both lines match (e.g. "Blog saved" +
    // "The blog was saved successfully").
    const toast = page.locator('[aria-live="assertive"]').getByText(titlePattern).first();
    await expect(toast).toBeVisible({ timeout: 10_000 });
}
