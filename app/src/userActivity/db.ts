/**
 * The app's own IndexedDB database for user activity, separate from the shared
 * `luminary-db`. Keeping it apart means the shared library owns synced server data only,
 * and a local-cache wipe there cannot take a user's likes, highlights and history with it.
 */

import Dexie, { type Table } from "dexie";
import type { Uuid } from "luminary-shared";

/** Which user activity a {@link UserActivityDoc} records. */
export type UserActivityType = "viewed" | "liked" | "highlighted";

/**
 * One record of something the user did to a piece of content. Shaped as a document —
 * deterministic `_id`, `updatedTimeUtc`, tombstones — so syncing it across a user's devices
 * later is a last-write-wins merge per activity rather than a redesign.
 */
export type UserActivityDoc = {
    /** `<type>:<contentId ?? parentId>` — the same activity yields the same key on every device. */
    _id: string;
    type: UserActivityType;
    /**
     * The post the activity belongs to. Optional only while unresolved: a highlight migrated
     * from storage that only knew its translation has no parent until that document is local.
     */
    parentId?: Uuid;
    /** The translation. Set for `highlighted` only — likes and views are per post. */
    contentId?: Uuid;
    updatedTimeUtc: number;
    /** Set instead of deleting the row, so an undone activity can propagate. */
    deleted?: boolean;
    /** Type-specific payload; only `highlighted` carries one. */
    payload?: { html: string };
};

class UserActivityDatabase extends Dexie {
    userActivity!: Table<UserActivityDoc>;

    constructor() {
        super("luminary-user-activity");

        // `[type+updatedTimeUtc]` serves the Library's per-type, newest-first reads straight
        // from the index. `parentId` is indexed for the lookup that resolves unresolved rows.
        this.version(1).stores({
            userActivity: "_id, type, parentId, contentId, updatedTimeUtc, [type+updatedTimeUtc]",
        });

        // Another tab upgrading this database needs this connection out of the way; it
        // reopens on its next use.
        this.on("versionchange", () => this.close());
    }
}

export const userActivityDb = new UserActivityDatabase();
