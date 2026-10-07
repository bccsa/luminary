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
import { db, type Uuid } from "luminary-shared";
import { notifyHighlightsChanged } from "@/recommendation/highlightStore";
import { userActivityDb, type UserActivityDoc, type UserActivityType } from "./db";

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
    payload?: UserActivityDoc["payload"],
): Promise<void> {
    await userActivityDb.userActivity.put({
        _id: userActivityId(ref),
        type: ref.type,
        parentId: ref.parentId,
        contentId: ref.type === "highlighted" ? ref.contentId : undefined,
        updatedTimeUtc: Date.now(),
        payload,
    });

    if (ref.type === "viewed") await trimViewed();
    userActivityVersion.value++;
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
    const existing = await userActivityDb.userActivity.get(_id);
    if (!existing || existing.deleted) return;

    await userActivityDb.userActivity.put({
        ...existing,
        updatedTimeUtc: Date.now(),
        deleted: true,
        payload: undefined,
    });

    if (ref.type === "highlighted") await dropStoredHighlight(ref.contentId);

    userActivityVersion.value++;
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

/** Every row of one type, oldest first, straight off the compound index. */
const ofType = (type: UserActivityType) =>
    userActivityDb.userActivity
        .where("[type+updatedTimeUtc]")
        .between([type, Dexie.minKey], [type, Dexie.maxKey]);

/** Newest first, tombstones excluded. */
export async function getUserActivity(
    type: UserActivityType,
    limit?: number,
): Promise<UserActivityDoc[]> {
    const rows = ofType(type)
        .reverse()
        .filter((row) => !row.deleted);

    return limit === undefined ? rows.toArray() : rows.limit(limit).toArray();
}

/** Whether a single activity is currently recorded — for a like button's state. */
export async function hasUserActivity(ref: ActivityRef): Promise<boolean> {
    const row = await userActivityDb.userActivity.get(userActivityId(ref));
    return !!row && !row.deleted;
}

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
    await userActivityDb.userActivity.bulkDelete(excess as string[]);
}

/**
 * Forget every activity. Backs the user-facing "clear library" action.
 *
 * The highlights' own store goes too. It is the source the migration re-reads on every start,
 * so leaving it would bring every cleared highlight back on the next load — and it is what
 * paints them into articles, so leaving it would also keep showing what the user just erased.
 */
export async function clearUserActivity(): Promise<void> {
    await userActivityDb.userActivity.clear();
    await db.setLuminaryInternals("highlights", {});
    notifyHighlightsChanged();
    userActivityVersion.value++;
}

/** Drop tombstones old enough that nothing can still need to learn of the removal. */
export async function pruneUserActivityTombstones(now: number = Date.now()): Promise<void> {
    const expired = await userActivityDb.userActivity
        .where("updatedTimeUtc")
        .below(now - TOMBSTONE_TTL_MS)
        .filter((row) => !!row.deleted)
        .primaryKeys();

    if (expired.length > 0) await userActivityDb.userActivity.bulkDelete(expired as string[]);
}
