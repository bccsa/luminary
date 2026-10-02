/**
 * One-time move of activity that predates this database: likes from `userPreferences`
 * (localStorage) and highlights from the shared `luminaryInternals` store.
 *
 * Neither pass ever overwrites a row already present here: a recorded activity is the more
 * recent truth, so a stale source entry must not revive something the user has since removed.
 */

import { db, type BaseDocumentDto } from "luminary-shared";
import { userPreferencesAsRef } from "@/globalConfig";
import { getHighlightRanges, getLegacyHighlightHtml } from "@/recommendation/highlightStore";
import { rangesFromLegacyHtml, type HighlightRange } from "@/util/highlightRanges";
import { userActivityDb, type UserActivityDoc } from "./db";
import { userActivityId } from "./store";

/** Write the rows the database does not already hold, and report how many were added. */
async function addMissing(rows: UserActivityDoc[]): Promise<number> {
    if (!rows.length) return 0;

    const existing = await userActivityDb.userActivity.bulkGet(rows.map((row) => row._id));
    const missing = rows.filter((_, i) => existing[i] === undefined);

    if (missing.length) await userActivityDb.userActivity.bulkPut(missing);
    return missing.length;
}

/**
 * Likes already store the post id, so they convert directly. Clearing the source is what
 * makes this idempotent — a second run finds nothing to move.
 */
export async function migrateLikesToUserActivity(): Promise<number> {
    const likes = userPreferencesAsRef.value.likes;
    if (!likes?.length) return 0;

    const added = await addMissing(
        likes.map((like) => ({
            _id: userActivityId({ type: "liked", parentId: like.id }),
            type: "liked",
            parentId: like.id,
            updatedTimeUtc: like.ts,
        })),
    );

    delete userPreferencesAsRef.value.likes;

    return added;
}

/**
 * Highlights are stored per translation and know nothing of their post, so each one's
 * `parentId` is read from its Content document. That document may not be local — an unsynced
 * language, or one dropped by retention — and the highlight is kept regardless: losing user
 * data to a failed lookup would be worse than a row that cannot be displayed yet.
 * `resolveUnresolvedParents` completes those rows once the document arrives.
 *
 * The source is deliberately left in place: `LHighlightable` still reads and writes it, so
 * clearing it would erase highlights from the article view. Re-running is safe because
 * existing rows are never overwritten.
 */
export async function migrateHighlightsToUserActivity(): Promise<number> {
    const stored = await db.getLuminaryInternals("highlights");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return 0;

    const entries = Object.entries(stored as Record<string, unknown>)
        .map(([contentId, value]) => ({ contentId, ranges: rangesOf(value), value }))
        .filter((entry) => entry.ranges.length > 0);

    if (!entries.length) return 0;

    const contentDocs = await db.docs.bulkGet(entries.map((entry) => entry.contentId));

    return addMissing(
        entries.map((entry, i) => ({
            _id: userActivityId({ type: "highlighted", contentId: entry.contentId }),
            type: "highlighted",
            contentId: entry.contentId,
            parentId: (contentDocs[i] as BaseDocumentDto | undefined)?.parentId,
            // Entries predating timestamps sort last rather than claiming to be new.
            updatedTimeUtc: updatedAtOf(entry.value),
            payload: { ranges: entry.ranges },
        })),
    );
}

/** Reads either stored shape, converting a legacy HTML snapshot to ranges over its own text. */
function rangesOf(value: unknown): HighlightRange[] {
    const ranges = getHighlightRanges(value);
    if (ranges?.length) return ranges;

    const html = getLegacyHighlightHtml(value);
    return html ? rangesFromLegacyHtml(html) : [];
}

function updatedAtOf(value: unknown): number {
    if (value && typeof value === "object" && "updatedAt" in value) {
        const updatedAt = (value as { updatedAt: unknown }).updatedAt;
        if (typeof updatedAt === "number" && Number.isFinite(updatedAt)) return updatedAt;
    }
    return 0;
}

/** Both passes, for the app to run once at startup. */
export async function migrateToUserActivity(): Promise<void> {
    await migrateLikesToUserActivity();
    await migrateHighlightsToUserActivity();
}
