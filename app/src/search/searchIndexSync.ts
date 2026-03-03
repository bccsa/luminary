/**
 * Keeps the MiniSearch index in sync with IndexedDB content documents.
 *
 * Registers Dexie table hooks on db.docs so that when content is added, updated,
 * or deleted (e.g. after sync from the CMS), the search index is updated in batches
 * without coupling the shared sync layer to the app's search module.
 */

import { db, DocType, type ContentDto } from "luminary-shared";
import {
    addAllToSearchIndex,
    isSearchIndexInitialized,
    removeAllFromSearchIndex,
    updateSearchIndex,
} from "./search";

/** Prevents registering db.docs hooks more than once. */
let hooksRegistered = false;

/** Content docs to add to the index; flushed in one addAllToSearchIndex call. */
const pendingAdds: ContentDto[] = [];
/** Document IDs to re-fetch and update in the index (updating hook only has old state). */
const pendingUpdates: string[] = [];
/** Document IDs to remove from the index. */
const pendingDeletes: string[] = [];
/** Ensures only one flush is scheduled per batch of hook calls (e.g. one bulkPut). */
let flushScheduled = false;

/**
 * Applies all pending add/update/delete changes to the search index.
 * Runs in a microtask after hooks fire, so IndexedDB writes are committed first.
 */
function flush(): void {
    if (!isSearchIndexInitialized()) {
        pendingAdds.length = 0;
        pendingUpdates.length = 0;
        pendingDeletes.length = 0;
        flushScheduled = false;
        return;
    }

    const toAdd = pendingAdds.splice(0, pendingAdds.length);
    const toUpdate = pendingUpdates.splice(0, pendingUpdates.length);
    const toDelete = pendingDeletes.splice(0, pendingDeletes.length);
    flushScheduled = false;

    if (toAdd.length > 0) {
        addAllToSearchIndex(toAdd);
    }

    if (toDelete.length > 0) {
        removeAllFromSearchIndex(toDelete);
    }

    if (toUpdate.length > 0) {
        void Promise.all(
            toUpdate.map((id) =>
                db.docs.get(id).then((doc) => {
                    if (doc && doc.type === DocType.Content) {
                        updateSearchIndex(doc as ContentDto);
                    }
                }),
            ),
        );
    }
}

/**
 * Schedules a single flush on the next microtask. Idempotent: many hook calls
 * in one tick result in one flush.
 */
function scheduleFlush(): void {
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(() => flush());
}

/**
 * Register Dexie table hooks so the search index stays in sync when content
 * documents are added, updated, or deleted in IndexedDB (e.g. after sync from CMS).
 * Call once after the search index has been initialized.
 */
export function registerSearchIndexSync(): void {
    if (hooksRegistered) return;
    hooksRegistered = true;

    db.docs.hook("creating", (primKey, obj) => {
        const doc = obj as BaseDocumentLike;
        if (doc?.type === DocType.Content) {
            pendingAdds.push(obj as ContentDto);
            scheduleFlush();
        }
    });

    // Dexie's "updating" hook receives the object before modifications; we store the id
    // and re-fetch in flush() to get the final document for updateSearchIndex.
    db.docs.hook("updating", (_modifications, primKey, obj) => {
        const doc = obj as BaseDocumentLike;
        if (doc?.type === DocType.Content) {
            pendingUpdates.push(String(primKey));
            scheduleFlush();
        }
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Dexie hook signature
    db.docs.hook("deleting", (primKey, _obj) => {
        pendingDeletes.push(String(primKey));
        scheduleFlush();
    });
}

interface BaseDocumentLike {
    type?: string;
}
