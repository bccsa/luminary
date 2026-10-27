/**
 * Local store for what the user did to content — viewed, liked, highlighted.
 *
 * Each activity is its own row, so the three are independently mergeable if they ever sync
 * across a user's devices: a like on one device and a highlight on another cannot overwrite
 * each other. Undoing an activity writes a tombstone rather than deleting the row, so the
 * undo itself can propagate.
 *
 * The data never leaves the device, so `privacyPolicy` gates nothing here — it gates any
 * future upload.
 */

import Dexie from "dexie";
import {
    db,
    DocType,
    type HighlightRange,
    type UserActivityDto,
    type UserActivityType,
    type Uuid,
} from "luminary-shared";
import { notifyHighlightsChanged } from "@/recommendation/highlightStore";

/** Bound `viewed` so a long-lived install can't grow it without limit. */
export const MAX_VIEWED = 500;
/** How long an undone activity is kept before the tombstone itself is dropped. */
export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * What identifies one activity. Liking and viewing apply to a post; highlighting applies to
 * one translation of it. Expressed as a union so a caller cannot name a post highlight or a
 * per-translation like — combinations the stored row itself cannot rule out.
 */
export type ActivityRef =
    | { type: "liked" | "viewed"; parentId: Uuid }
    | { type: "highlighted"; contentId: Uuid; parentId: Uuid };

/** The id that makes an activity unique, taken from its type rather than from what is set. */
const identityOf = (ref: ActivityRef): Uuid =>
    ref.type === "highlighted" ? ref.contentId : ref.parentId;

export const userActivityId = (ref: ActivityRef): string => `${ref.type}:${identityOf(ref)}`;

/**
 * Record an activity, or refresh the timestamp of one already recorded. Re-recording revives
 * a tombstoned row, so re-liking something that was unliked needs no special case.
 */
export async function recordUserActivity(
    ref: ActivityRef,
    payload?: UserActivityDto["payload"],
): Promise<void> {
    await db.userActivity.put({
        _id: userActivityId(ref),
        type: DocType.UserActivity,
        activity: ref.type,
        parentId: ref.parentId,
        contentId: ref.type === "highlighted" ? ref.contentId : undefined,
        updatedTimeUtc: Date.now(),
        payload,
    });

    if (ref.type === "viewed") await trimViewed();
}

/**
 * Undo an activity. Keeps the row as a tombstone so the removal is itself a fact.
 *
 * A highlight's own entry goes with it: it is what paints the marks into the article, and it is
 * what the migration re-reads on every start, so leaving it would both keep showing the
 * highlight and bring its row back on the next load.
 */
export async function removeUserActivity(ref: ActivityRef): Promise<void> {
    const _id = userActivityId(ref);
    const existing = await db.userActivity.get(_id);
    if (!existing || existing.deleted) return;

    await db.userActivity.put({
        ...existing,
        updatedTimeUtc: Date.now(),
        deleted: true,
        payload: undefined,
    });

    if (ref.type === "highlighted") await dropStoredHighlight(ref.contentId);
}

/**
 * Delete a single passage from a highlight, keeping the others. Removing the last one removes
 * the whole activity.
 *
 * Both copies change: the row feeds the activity page, while the `highlights` entry is what
 * `LHighlightable` paints from and saves back — left alone, the next save would restore the passage.
 */
export async function removeHighlightRange(
    ref: Extract<ActivityRef, { type: "highlighted" }>,
    range: HighlightRange,
): Promise<void> {
    const row = await db.userActivity.get(userActivityId(ref));
    if (!row || row.deleted) return;

    const remaining = (row.payload?.ranges ?? []).filter(
        (r) => !(r.start === range.start && r.end === range.end),
    );
    if (remaining.length === (row.payload?.ranges.length ?? 0)) return;

    if (!remaining.length) return removeUserActivity(ref);

    // The card keeps its place in the feed: tidying a highlight is not new activity.
    await db.userActivity.put({ ...row, payload: { ranges: remaining } });

    const stored = await db.getLuminaryInternals("highlights");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        await db.setLuminaryInternals("highlights", {
            ...(stored as Record<string, unknown>),
            [ref.contentId]: {
                ranges: remaining,
                updatedAt: row.updatedTimeUtc,
                parentId: ref.parentId,
            },
        });
        notifyHighlightsChanged();
    }
}

/** Removes one content's marks from the store `LHighlightable` reads and writes. */
async function dropStoredHighlight(contentId: Uuid): Promise<void> {
    const stored = await db.getLuminaryInternals("highlights");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return;

    const data = { ...(stored as Record<string, unknown>) };
    if (!(contentId in data)) return;

    delete data[contentId];
    await db.setLuminaryInternals("highlights", data);
    notifyHighlightsChanged();
}

/** Every row of one activity, oldest first, straight off the compound index. */
const ofType = (activity: UserActivityType) =>
    db.userActivity
        .where("[activity+updatedTimeUtc]")
        .between([activity, Dexie.minKey], [activity, Dexie.maxKey]);

/**
 * Drop the oldest `viewed` rows past the cap. Counts and deletes off the index so a record
 * never has to read the rows it is keeping.
 */
async function trimViewed(): Promise<void> {
    const stored = await ofType("viewed").count();
    if (stored <= MAX_VIEWED) return;

    const excess = await ofType("viewed")
        .limit(stored - MAX_VIEWED)
        .primaryKeys();
    await db.userActivity.bulkDelete(excess as string[]);
}

/**
 * Forget every activity. Backs the user-facing "clear activity" action.
 *
 * The highlights' own store goes too. It is the source the migration re-reads on every start,
 * so leaving it would bring every cleared highlight back on the next load — and it is what
 * paints them into articles, so leaving it would also keep showing what the user just erased.
 */
export async function clearUserActivity(): Promise<void> {
    await db.userActivity.clear();
    await db.setLuminaryInternals("highlights", {});
    notifyHighlightsChanged();
}

/** Drop tombstones old enough that nothing can still need to learn of the removal. */
export async function pruneUserActivityTombstones(now: number = Date.now()): Promise<void> {
    const expired = await db.userActivity
        .where("updatedTimeUtc")
        .below(now - TOMBSTONE_TTL_MS)
        .filter((row) => !!row.deleted)
        .primaryKeys();

    if (expired.length > 0) await db.userActivity.bulkDelete(expired as string[]);
}
