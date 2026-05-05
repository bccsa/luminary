import { cmsTest as test, expect } from "../../fixtures/test";
import { findSeededPublishedPost, readLocalChangesForDoc } from "../../fixtures/db";

const SAVE = '[data-test="save-button"]:visible';
const TITLE_INPUT = 'input[name="title"]';
// EditContentActionsWrapper renders TWO badges (mobile + desktop) — only one
// is visible at a time per the responsive `lg:hidden` / `lg:flex` classes.
// `.first()` would pick whichever appears first in DOM order regardless of
// visibility, so use a `:visible` filter to get the one that actually renders.
const OFFLINE_BADGE = ':visible:text-is("Offline changes")';

/**
 * Offline-first change request flow:
 *   edit content → write to IndexedDB → "Offline changes" badge while offline
 *   → reconnect → syncLocalChanges pushes → API ACKs → badge clears.
 *
 * Tests run serially against a single seeded post so concurrent edits don't
 * step on each other and so revert reliably restores the title between tests.
 */
test.describe.configure({ mode: "serial" });

test.describe("CMS offline-first change request", () => {
    test.beforeEach(async ({ page }) => {
        // Land somewhere authenticated and let the initial sync populate IndexedDB.
        await page.goto("/", { waitUntil: "networkidle" });
    });

    test("online save: write goes through and localChanges drains", async ({ page }) => {
        const seed = await findSeededPublishedPost(page);
        test.skip(
            seed === null,
            "no seeded published post found in IndexedDB — cannot run offline-edit-sync",
        );
        if (!seed) return;

        await page.goto(`/post/edit/${seed.parentTagOrPostType}/${seed.parentId}/${seed.languageCode}`, {
            waitUntil: "domcontentloaded",
        });

        const titleInput = page.locator(TITLE_INPUT);
        await titleInput.waitFor({ state: "visible", timeout: 30_000 });
        const originalTitle = (await titleInput.inputValue()) || seed.title;
        const newTitle = `${originalTitle} — e2e ${Date.now()}`;

        await titleInput.fill(newTitle);
        await page.locator(SAVE).click();

        // Success toast appears once save() resolves locally.
        await expect(
            page.locator('[aria-live="assertive"]').getByText(/saved/i).first(),
        ).toBeVisible({ timeout: 10_000 });

        // We're online — the watcher should drain localChanges for the parent quickly.
        await expect
            .poll(() => readLocalChangesForDoc(page, seed.parentId), { timeout: 30_000 })
            .toEqual([]);
        await expect(page.locator(OFFLINE_BADGE)).toHaveCount(0);

        // Best-effort cleanup: try to restore the original title so the seed
        // doesn't accumulate junk. We don't assert success because the cleanup
        // depends on the API actually persisting the previous save round-trip
        // (and being able to accept another edit), neither of which is in this
        // test's contract. The primary "online save" assertions are already
        // verified above; cleanup failure shouldn't fail the test.
        try {
            await page.reload({ waitUntil: "domcontentloaded" });
            await titleInput.waitFor({ state: "visible", timeout: 30_000 });
            await expect(titleInput).toHaveValue(newTitle, { timeout: 10_000 });
            await titleInput.fill(originalTitle);
            await page.locator(SAVE).click();
            await expect
                .poll(() => readLocalChangesForDoc(page, seed.parentId), { timeout: 15_000 })
                .toEqual([]);
        } catch {
            // Cleanup is best-effort; primary assertions already passed.
        }
    });

    test("offline save: queues locally, syncs after reconnect", async ({ page, context }) => {
        const seed = await findSeededPublishedPost(page);
        test.skip(
            seed === null,
            "no seeded published post found in IndexedDB — cannot run offline-edit-sync",
        );
        if (!seed) return;

        await page.goto(`/post/edit/${seed.parentTagOrPostType}/${seed.parentId}/${seed.languageCode}`, {
            waitUntil: "domcontentloaded",
        });

        const titleInput = page.locator(TITLE_INPUT);
        await titleInput.waitFor({ state: "visible", timeout: 30_000 });
        const originalTitle = (await titleInput.inputValue()) || seed.title;
        const newTitle = `${originalTitle} — e2e offline ${Date.now()}`;

        await context.setOffline(true);

        await titleInput.fill(newTitle);
        await page.locator(SAVE).click();

        // While offline, the change is queued locally and the badge is shown.
        await expect(page.locator(OFFLINE_BADGE).first()).toBeVisible({ timeout: 10_000 });
        await expect
            .poll(() => readLocalChangesForDoc(page, seed.parentId), { timeout: 10_000 })
            .not.toEqual([]);

        // Reconnect → syncLocalChanges fires once the socket reconnects.
        await context.setOffline(false);

        await expect(page.locator(OFFLINE_BADGE)).toHaveCount(0, { timeout: 60_000 });
        await expect
            .poll(() => readLocalChangesForDoc(page, seed.parentId), { timeout: 60_000 })
            .toEqual([]);

        // Reload from server to confirm the new title persisted past the local DB.
        await page.reload({ waitUntil: "domcontentloaded" });
        await titleInput.waitFor({ state: "visible", timeout: 30_000 });
        await expect(titleInput).toHaveValue(newTitle);

        // Restore the original title so the next test (and the next run) starts clean.
        await titleInput.fill(originalTitle);
        await page.locator(SAVE).click();
        await expect
            .poll(() => readLocalChangesForDoc(page, seed.parentId), { timeout: 30_000 })
            .toEqual([]);
    });

    test("offline queue survives page reload until reconnect", async ({ page, context }) => {
        const seed = await findSeededPublishedPost(page);
        test.skip(
            seed === null,
            "no seeded published post found in IndexedDB — cannot run offline-edit-sync",
        );
        if (!seed) return;

        await page.goto(`/post/edit/${seed.parentTagOrPostType}/${seed.parentId}/${seed.languageCode}`, {
            waitUntil: "domcontentloaded",
        });

        const titleInput = page.locator(TITLE_INPUT);
        await titleInput.waitFor({ state: "visible", timeout: 30_000 });
        const originalTitle = (await titleInput.inputValue()) || seed.title;
        const newTitle = `${originalTitle} — e2e persist ${Date.now()}`;

        await context.setOffline(true);

        await titleInput.fill(newTitle);
        await page.locator(SAVE).click();
        await expect(page.locator(OFFLINE_BADGE).first()).toBeVisible({ timeout: 10_000 });

        // Reload while still offline — the queue should survive.
        await page.reload({ waitUntil: "domcontentloaded" });
        await titleInput.waitFor({ state: "visible", timeout: 30_000 });
        await expect(titleInput).toHaveValue(newTitle);
        await expect(page.locator(OFFLINE_BADGE).first()).toBeVisible({ timeout: 10_000 });
        await expect
            .poll(() => readLocalChangesForDoc(page, seed.parentId), { timeout: 10_000 })
            .not.toEqual([]);

        // Reconnect drains.
        await context.setOffline(false);
        await expect(page.locator(OFFLINE_BADGE)).toHaveCount(0, { timeout: 60_000 });
        await expect
            .poll(() => readLocalChangesForDoc(page, seed.parentId), { timeout: 60_000 })
            .toEqual([]);

        // Restore the original title.
        await titleInput.fill(originalTitle);
        await page.locator(SAVE).click();
        await expect
            .poll(() => readLocalChangesForDoc(page, seed.parentId), { timeout: 30_000 })
            .toEqual([]);
    });
});
