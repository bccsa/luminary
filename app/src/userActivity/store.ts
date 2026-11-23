import {
    normalizeUserActivityDocument,
    userActivityDocumentId,
    toLegacyUserActivityDocument,
    type HighlightRange,
    type UserActivityDto,
    type UserActivityEntry,
    type UserActivityKind,
    type Uuid,
} from "luminary-shared";
import {
    clearLocalUserActivity,
    deleteSourceUserActivityDocs,
    getSourceUserActivityDoc,
    getUserActivitySource,
    isUserActivitySignedIn,
    listSourceUserActivityDocs,
    upsertSourceUserActivityDoc,
} from "./source";
import { notifyUserActivityChanged } from "./state";
export { userActivityVersion } from "./state";

/** UI row: activity time is distinct from the server's sync cursor. */
export type ActivityEntry = UserActivityEntry & { activityTimeUtc: number };
export const MAX_VIEWED = 500;
export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type ActivityRef =
    | { type: "liked" | "viewed"; parentId: Uuid }
    | { type: "highlighted"; contentId: Uuid; parentId: Uuid; range: HighlightRange };

export const userActivityId = userActivityDocumentId;

function toEntry(doc: UserActivityDto): ActivityEntry {
    const legacy = toLegacyUserActivityDocument(doc);
    return {
        _id: doc._id,
        type: doc.type,
        parentId: doc.parentId,
        contentId: doc.contentId,
        updatedTimeUtc: doc.updatedTimeUtc,
        activityTimeUtc: doc.activityTimeUtc,
        deleted: doc.deleted,
        payload: legacy.payload,
    };
}

function toDoc(row: UserActivityEntry & { activityTimeUtc?: number }): UserActivityDto {
    return normalizeUserActivityDocument(row);
}

/** Migration/backfill writes never replace an existing row, including a tombstone. */
export async function addMissingUserActivity(rows: UserActivityEntry[]): Promise<number> {
    const source = await getUserActivitySource();
    return source.db.transaction("rw", source.db.docs, source.db.localChanges, async () => {
        let added = 0;
        for (const row of rows) {
            const doc = toDoc(row);
            if (await source.db.docs.get(doc._id)) continue;
            await source.db.upsert({ doc, overwriteLocalChanges: true });
            added++;
        }
        if (added) notifyUserActivityChanged();
        return added;
    });
}

export async function recordUserActivity(
    activity: ActivityRef,
    payload?: UserActivityEntry["payload"],
): Promise<void> {
    await upsertSourceUserActivityDoc(
        toDoc({
            _id: userActivityId(activity),
            type: activity.type,
            parentId: activity.parentId,
            contentId: activity.type === "highlighted" ? activity.contentId : undefined,
            updatedTimeUtc: Date.now(),
            payload:
                activity.type === "highlighted"
                    ? { range: payload?.range ?? activity.range }
                    : payload,
        }),
    );
    if (activity.type === "viewed") await trimViewed();
    notifyUserActivityChanged();
}

async function tombstone(doc: UserActivityDto): Promise<void> {
    const deleted = {
        ...doc,
        activityTimeUtc: Date.now(),
        deleted: true,
    };
    if (deleted.type === "highlighted")
        deleted.range = { start: deleted.range.start, end: deleted.range.end };
    await upsertSourceUserActivityDoc(deleted);
}

export async function removeUserActivity(activity: ActivityRef): Promise<void> {
    const doc = await getSourceUserActivityDoc(userActivityId(activity));
    if (!doc || doc.deleted) return;
    await tombstone(doc);
    notifyUserActivityChanged();
}

export async function removeHighlightRange(
    activity: Omit<Extract<ActivityRef, { type: "highlighted" }>, "range">,
    range: HighlightRange,
): Promise<void> {
    await removeUserActivity({ ...activity, range });
}

export async function getUserActivity(
    type: UserActivityKind,
    limit?: number,
): Promise<ActivityEntry[]> {
    const rows = (await getAllUserActivity()).filter((row) => row.type === type);
    return limit === undefined ? rows : rows.slice(0, limit);
}

export async function getAllUserActivity(): Promise<ActivityEntry[]> {
    return (await listSourceUserActivityDocs())
        .filter((doc) => !doc.deleted)
        .map(toEntry)
        .sort((a, b) => b.activityTimeUtc - a.activityTimeUtc);
}

export async function hasUserActivity(activity: ActivityRef): Promise<boolean> {
    const doc = await getSourceUserActivityDoc(userActivityId(activity));
    return !!doc && !doc.deleted;
}

/** Keep an existing activity's time stable when a view only needs to ensure it exists. */
export async function ensureUserActivity(activity: ActivityRef): Promise<void> {
    if (!(await hasUserActivity(activity))) await recordUserActivity(activity);
}

/** Viewed posts used by recommendations; no local history exists during prerender. */
export async function getViewedParentIds(): Promise<Set<Uuid>> {
    try {
        return new Set((await getUserActivity("viewed")).map((row) => row.parentId));
    } catch {
        return new Set();
    }
}

async function trimViewed(): Promise<void> {
    const viewed = (await listSourceUserActivityDocs())
        .filter((doc) => doc.type === "viewed" && !doc.deleted)
        .sort((a, b) => b.activityTimeUtc - a.activityTimeUtc);
    for (const doc of viewed.slice(MAX_VIEWED)) await tombstone(doc);
}

export async function clearUserActivity(): Promise<void> {
    if (!isUserActivitySignedIn()) {
        await clearLocalUserActivity();
    } else {
        // Include existing tombstones too, so every held row records this account-wide clear.
        for (const doc of await listSourceUserActivityDocs()) await tombstone(doc);
        notifyUserActivityChanged();
    }
}

export async function pruneUserActivityTombstones(now = Date.now()): Promise<void> {
    const expired = (await listSourceUserActivityDocs())
        .filter((doc) => doc.deleted && doc.activityTimeUtc < now - TOMBSTONE_TTL_MS)
        .map((doc) => doc._id);
    if (expired.length) await deleteSourceUserActivityDocs(expired);
}
