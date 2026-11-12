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

import { ref } from "vue";
import Dexie from "dexie";
import {
    db,
    type HighlightRange,
    type UserActivityEntry,
    type UserActivityType,
    type Uuid,
} from "luminary-shared";
import { notifyHighlightsChanged } from "@/recommendation/highlightStore";

/**
 * IndexedDB has no Vue reactivity. Every write bumps this, so views reading the table
 * re-read when it changes — the same idiom as `seenVersion` and `highlightVersion`.
 */
export const userActivityVersion = ref(0);

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
    | { type: "highlighted"; contentId: Uuid; parentId: Uuid; range: HighlightRange };

/** The id that makes an activity unique, taken from its type rather than from what is set. */
const identityOf = (ref: ActivityRef): string =>
    ref.type === "highlighted"
        ? `${ref.contentId}:${ref.range.start}-${ref.range.end}`
        : ref.parentId;

export const userActivityId = (ref: ActivityRef): string => `${ref.type}:${identityOf(ref)}`;

async function readStoredActivity(ref: ActivityRef): Promise<UserActivityEntry | undefined> {
    return db.userActivity.get(userActivityId(ref));
}

async function writeStoredActivity(row: UserActivityEntry): Promise<void> {
    await db.userActivity.put(row);
}

/**
 * Record an activity, or refresh the timestamp of one already recorded. Re-recording revives
 * a tombstoned row, so re-liking something that was unliked needs no special case.
 */
export async function recordUserActivity(
    ref: ActivityRef,
    payload?: UserActivityEntry["payload"],
): Promise<void> {
    const resolvedPayload =
        ref.type === "highlighted"
            ? { range: payload?.range ?? ref.range }
            : payload;

    const row: UserActivityEntry = {
        _id: userActivityId(ref),
        type: ref.type,
        parentId: ref.parentId,
        contentId: ref.type === "highlighted" ? ref.contentId : undefined,
        updatedTimeUtc: Date.now(),
        payload: resolvedPayload,
    };

    await writeStoredActivity(row);

    if (ref.type === "viewed") await trimViewed();
    if (ref.type === "highlighted") notifyHighlightsChanged();
    userActivityVersion.value++;
}

/**
 * Undo an activity. Keeps the row as a tombstone so the removal is itself a fact.
 */
export async function removeUserActivity(ref: ActivityRef): Promise<void> {
    const existing = await readStoredActivity(ref);
    if (!existing || existing.deleted) return;

    const row: UserActivityEntry = {
        ...existing,
        updatedTimeUtc: Date.now(),
        deleted: true,
        payload: undefined,
    };
    await writeStoredActivity(row);

    if (ref.type === "highlighted") notifyHighlightsChanged();

    userActivityVersion.value++;
}

/** Delete one passage's row by tombstoning it. */
export async function removeHighlightRange(
    ref: Omit<Extract<ActivityRef, { type: "highlighted" }>, "range">,
    range: HighlightRange,
): Promise<void> {
    await removeUserActivity({ ...ref, range });
}

/** Every row of one type, oldest first, straight off the compound index. */
const ofType = async (type: UserActivityType): Promise<UserActivityEntry[]> => {
    return db.userActivity
        .where("[type+updatedTimeUtc]")
        .between([type, Dexie.minKey], [type, Dexie.maxKey])
        .toArray();
};

/** Newest first, tombstones excluded. */
export async function getUserActivity(
    type: UserActivityType,
    limit?: number,
): Promise<UserActivityEntry[]> {
    const rows = (await ofType(type)).filter((row: UserActivityEntry) => !row.deleted);
    const newestFirst = rows.sort((a: UserActivityEntry, b: UserActivityEntry) => b.updatedTimeUtc - a.updatedTimeUtc);
    return limit === undefined ? newestFirst : newestFirst.slice(0, limit);
}

/**
 * Every activity, whatever its type, newest first and tombstones excluded — the feed the
 * activity page's "all" filter shows.
 */
export async function getAllUserActivity(): Promise<UserActivityEntry[]> {
    return db.userActivity
        .orderBy("updatedTimeUtc")
        .reverse()
        .filter((row: UserActivityEntry) => !row.deleted)
        .toArray();
}

/** Whether a single activity is currently recorded — for a like button's state. */
export async function hasUserActivity(ref: ActivityRef): Promise<boolean> {
    const row = await readStoredActivity(ref);
    return !!row && !row.deleted;
}

/**
 * Drop the oldest `viewed` rows past the cap. Counts and deletes off the index so a record
 * never has to read the rows it is keeping.
 */
async function trimViewed(): Promise<void> {
    const stored = await ofType("viewed");
    if (stored.length <= MAX_VIEWED) return;

    const excess = stored
        .sort((a: UserActivityEntry, b: UserActivityEntry) => a.updatedTimeUtc - b.updatedTimeUtc)
        .slice(0, stored.length - MAX_VIEWED)
        .map((row: UserActivityEntry) => row._id);
    await db.userActivity.bulkDelete(excess as string[]);
}

/** Forget every activity. Backs the user-facing "clear activity" action. */
export async function clearUserActivity(): Promise<void> {
    await db.userActivity.clear();
    notifyHighlightsChanged();
    userActivityVersion.value++;
}

/** Drop tombstones old enough that nothing can still need to learn of the removal. */
export async function pruneUserActivityTombstones(now: number = Date.now()): Promise<void> {
    const expired = await db.userActivity
        .where("updatedTimeUtc")
        .below(now - TOMBSTONE_TTL_MS)
        .filter((row: UserActivityEntry) => !!row.deleted)
        .primaryKeys();

    if (expired.length > 0) await db.userActivity.bulkDelete(expired as string[]);
}
