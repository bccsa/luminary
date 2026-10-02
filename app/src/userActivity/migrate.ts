/**
 * One-time move of activity that predates this database: likes from `userPreferences`
 * (localStorage) and highlights from the shared `luminaryInternals` store.
 *
 * Neither pass ever overwrites a row already present here: a recorded activity is the more
 * recent truth, so a stale source entry must not revive something the user has since removed.
 */

import { db, type BaseDocumentDto, type Uuid } from "luminary-shared";
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
 * Highlights are stored per translation. Entries written since the post was stored with them
 * carry it; older ones are matched to their Content document instead. An entry whose post
 * cannot be found either way is skipped — its document is not local, so the Library could not
 * render it anyway — and picked up by a later run once that document syncs.
 *
 * The source is deliberately left in place: `LHighlightable` still reads and writes it, so
 * clearing it would erase highlights from the article view. That is also what makes skipping
 * safe: nothing is lost, the entry is simply migrated later.
 */
export async function migrateHighlightsToUserActivity(): Promise<number> {
    const stored = await db.getLuminaryInternals("highlights");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return 0;

    const entries = Object.entries(stored as Record<string, unknown>)
        .map(([contentId, value]) => ({ contentId, ranges: rangesOf(value), value }))
        .filter((entry) => entry.ranges.length > 0);

    if (!entries.length) return 0;

    const contentDocs = await db.docs.bulkGet(entries.map((entry) => entry.contentId));

    const rows = entries
        .map((entry, i) => ({
            entry,
            parentId:
                parentIdOf(entry.value) ??
                (contentDocs[i] as BaseDocumentDto | undefined)?.parentId,
        }))
        .filter((row): row is { entry: (typeof entries)[number]; parentId: Uuid } => !!row.parentId)
        .map(({ entry, parentId }) => ({
            _id: userActivityId({ type: "highlighted", contentId: entry.contentId, parentId }),
            type: "highlighted" as const,
            contentId: entry.contentId,
            parentId,
            // Entries predating timestamps sort last rather than claiming to be new.
            updatedTimeUtc: updatedAtOf(entry.value),
            payload: { ranges: entry.ranges },
        }));

    return addMissing(rows);
}

/** Reads either stored shape, converting a legacy HTML snapshot to ranges over its own text. */
function rangesOf(value: unknown): HighlightRange[] {
    const ranges = getHighlightRanges(value);
    if (ranges?.length) return ranges;

    const html = getLegacyHighlightHtml(value);
    return html ? rangesFromLegacyHtml(html) : [];
}

/** The post stored with the entry, for highlights written since it was carried. */
function parentIdOf(value: unknown): Uuid | undefined {
    if (value && typeof value === "object" && "parentId" in value) {
        const parentId = (value as { parentId: unknown }).parentId;
        if (typeof parentId === "string" && parentId) return parentId;
    }
    return undefined;
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
