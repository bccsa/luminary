/**
 * One-time move of activity that predates this database: likes from `userPreferences`
 * (localStorage), highlights from the shared `luminaryInternals` store and the seen ids
 * recommendations used to keep in localStorage.
 *
 * Neither pass ever overwrites a row already present here: a recorded activity is the more
 * recent truth, so a stale source entry must not revive something the user has since removed.
 */

import {
    db,
    type BaseDocumentDto,
    type HighlightRange,
    type UserActivityEntry,
    type Uuid,
} from "luminary-shared";
import { getHighlightRanges, getLegacyHighlightHtml } from "@/recommendation/highlightStore";
import { rangesFromLegacyHtml } from "@/util/highlightRanges";
import { userActivityId, userActivityVersion } from "./store";

/** A like as `userPreferences` stored it. */
export type LegacyLike = { id: Uuid; ts: number };

/** Write the rows the database does not already hold, and report how many were added. */
async function addMissing(rows: UserActivityEntry[]): Promise<number> {
    if (!rows.length) return 0;

    const existing = await db.userActivity.bulkGet(rows.map((row) => row._id));
    const missing = rows.filter((_, i) => existing[i] === undefined);

    if (missing.length) {
        await db.userActivity.bulkPut(missing);
        userActivityVersion.value++;
    }
    return missing.length;
}

/** Likes already store the post id, so they convert directly. The caller clears the source. */
export async function migrateLikesToUserActivity(likes?: LegacyLike[]): Promise<number> {
    if (!likes?.length) return 0;

    return addMissing(
        likes.map((like) => ({
            _id: userActivityId({ type: "liked", parentId: like.id }),
            type: "liked",
            parentId: like.id,
            updatedTimeUtc: like.ts,
        })),
    );
}

/**
 * Highlights are stored per translation. Entries written since the post was stored with them
 * carry it; older ones are matched to their Content document instead. An entry whose post
 * cannot be found either way is skipped — its document is not local, so the activity page could not
 * render it anyway.
 *
 * The source is deliberately left in place: `LHighlightable` still reads and writes it, so
 * clearing it would erase highlights from the article view.
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

/** Key the recommendations' seen ids were stored under before they moved to `viewed` rows. */
const LEGACY_SEEN_KEY = "seenArticleIds";

/**
 * Seen ids are per translation, `viewed` rows per post, so each id is matched to its Content
 * document for the post. An id whose document is not local is dropped: the key is removed after
 * the first run, which is what makes this a one-time move. Rows are dated 0 because the source
 * has no timestamps, which keeps them below real history and first in line for the `viewed` cap.
 */
export async function migrateSeenToUserActivity(): Promise<number> {
    let ids: unknown;
    try {
        ids = JSON.parse(localStorage.getItem(LEGACY_SEEN_KEY) ?? "null");
    } catch {
        ids = null;
    }
    if (!Array.isArray(ids)) {
        localStorage.removeItem(LEGACY_SEEN_KEY);
        return 0;
    }

    const contentIds = ids.filter((id): id is Uuid => typeof id === "string" && !!id);
    const docs = (await db.docs.bulkGet(contentIds)) as (BaseDocumentDto | undefined)[];

    const parentIds = new Set(docs.flatMap((doc) => (doc?.parentId ? [doc.parentId] : [])));

    const added = await addMissing(
        [...parentIds].map((parentId) => ({
            _id: userActivityId({ type: "viewed", parentId }),
            type: "viewed" as const,
            parentId,
            updatedTimeUtc: 0,
        })),
    );

    localStorage.removeItem(LEGACY_SEEN_KEY);
    return added;
}

/** Both passes, for the app to run once. */
export async function migrateToUserActivity(likes?: LegacyLike[]): Promise<void> {
    await migrateLikesToUserActivity(likes);
    await migrateHighlightsToUserActivity();
}
