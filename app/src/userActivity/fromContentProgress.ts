/**
 * Mirrors the "continue reading / watching" store into `viewed` activity.
 *
 * Opening a page is not reading it, so history follows progress rather than navigation.
 * Continue keeps only its ten most recent entries and drops an article the moment it is
 * finished — the mirror copies each entry out before either happens, and nothing here is
 * ever dropped for being complete.
 */

import { watch } from "vue";
import { db, type BaseDocumentDto, type Uuid } from "luminary-shared";
import { contentProgressAsRef, type ContentProgressEntry } from "@/contentProgress";
import { userActivityDb, type UserActivityDoc } from "./db";
import { recordUserActivity, userActivityId, userActivityVersion } from "./store";

/**
 * Reading confirms one segment at a time, so a long article writes progress dozens of
 * times. Recency is worth at most one write a minute per post.
 */
export const MIRROR_INTERVAL_MS = 60_000;

/** The progress last copied for a content, and when the copy was made. */
type Mirrored = { updatedAt: number; at: number };

/**
 * Start mirroring progress into history, and return the function that stops it. State is
 * per-run rather than module-wide so stopping really does forget everything.
 */
export function startContentProgressMirror(): () => void {
    const mirrored = new Map<Uuid, Mirrored>();
    /** A translation never moves to another post, so the first lookup is the only one. */
    const parents = new Map<Uuid, Uuid>();

    async function parentIdOf(contentId: Uuid): Promise<Uuid | undefined> {
        const known = parents.get(contentId);
        if (known) return known;

        const doc = (await db.docs.get(contentId)) as BaseDocumentDto | undefined;
        if (doc?.parentId) parents.set(contentId, doc.parentId);
        return doc?.parentId;
    }

    /**
     * Progress already on the device when the mirror starts. Rows are written with the
     * progress entry's own timestamp rather than now, so a restart cannot reorder history,
     * and an entry that already has a row is left alone — including one the user has
     * deleted, which would otherwise come back on every start.
     */
    async function backfill(entries: ContentProgressEntry[]): Promise<void> {
        const rows = new Map<string, UserActivityDoc>();

        for (const entry of entries) {
            const parentId = await parentIdOf(entry.contentId);
            if (!parentId) continue;

            mirrored.set(entry.contentId, { updatedAt: entry.updatedAt, at: entry.updatedAt });

            // Two translations of one post share a row; the later one dates it.
            const _id = userActivityId({ type: "viewed", parentId });
            if ((rows.get(_id)?.updatedTimeUtc ?? -1) >= entry.updatedAt) continue;
            rows.set(_id, { _id, type: "viewed", parentId, updatedTimeUtc: entry.updatedAt });
        }

        if (!rows.size) return;

        const ids = [...rows.keys()];
        const stored = await userActivityDb.userActivity.bulkGet(ids);
        const missing = ids.filter((_, i) => stored[i] === undefined).map((id) => rows.get(id)!);

        if (!missing.length) return;

        await userActivityDb.userActivity.bulkPut(missing);
        userActivityVersion.value++;
    }

    /** Copy the entries whose progress moved since they were last copied. */
    async function mirror(entries: ContentProgressEntry[]): Promise<void> {
        const now = Date.now();

        for (const entry of entries) {
            const last = mirrored.get(entry.contentId);
            if (last?.updatedAt === entry.updatedAt) continue;

            // Still note the progress passed over, so the next change is measured against it.
            if (last && now - last.at < MIRROR_INTERVAL_MS) {
                mirrored.set(entry.contentId, { updatedAt: entry.updatedAt, at: last.at });
                continue;
            }

            // An unsynced document has no post to attribute the view to. Leaving the entry
            // uncopied is what retries it: its next progress change comes back through here.
            const parentId = await parentIdOf(entry.contentId);
            if (!parentId) continue;

            mirrored.set(entry.contentId, { updatedAt: entry.updatedAt, at: now });
            await recordUserActivity({ type: "viewed", parentId });
        }
    }

    // Progress is written faster than it is copied, so runs are chained rather than
    // overlapped — two passes over the same entry would both get past the guard above.
    let pending = Promise.resolve();
    const queue = (run: () => Promise<void>) =>
        (pending = pending
            .then(run)
            .catch((err) => console.error("Content progress mirror:", err)));

    // The list is taken now rather than when the run starts: anything written in between
    // reaches the watcher below, which is chained behind this.
    const initial = contentProgressAsRef.value;
    queue(() => backfill(initial));

    // Every progress write replaces the array, so a shallow watch sees all of them.
    return watch(contentProgressAsRef, (entries) => void queue(() => mirror(entries)));
}
