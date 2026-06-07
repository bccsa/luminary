import { watch } from "vue";
import { DocType, type ApiDataResponseDto, type BaseDocumentDto, type ContentDto } from "../../types";
import { db } from "../../db/database";
import { isSyncableDoc } from "../../db/isSyncable";
import { getSocket } from "../../socket/socketio";
import { setBaseRooms } from "../../socket/roomSubscriptions";
import { getContentPublishDateCutoff } from "../../config";
import { syncList } from "./state";
import { splitChunkTypeString } from "./utils";

let _initialized = false;

/**
 * Map the current `syncList` to the set of Socket.io room docTypes to subscribe to.
 * Content updates are broadcast server-side to the PARENT's rooms (`post-{group}` /
 * `tag-{group}`), so a `content:post` entry maps to its subType (`post`); other
 * entries map to their own type. `DeleteCmd` chunks are skipped — the server joins
 * the matching `deleteCmd-{group}` rooms automatically alongside each primary join.
 */
function roomDocTypesFromSyncList(): DocType[] {
    const types = new Set<DocType>();
    for (const entry of syncList.value) {
        const { type, subType } = splitChunkTypeString(entry.chunkType);
        if (type === DocType.DeleteCmd) continue;
        if (type === DocType.Content) {
            if (subType) types.add(subType);
        } else {
            types.add(type);
        }
    }
    return Array.from(types);
}

/**
 * Apply one Socket.io `"data"` batch to IndexedDB.
 *
 * Socket.io is a pure transport — it does not decide what to persist. This is
 * where that decision lives: incoming live updates are filtered through
 * `isSyncableDoc` (the sync2-`syncList`-derived gate), and the result is written
 * via `db.bulkPut` (which resolves `DeleteCmd`s with its own stale-delete guard).
 *
 * Below-cutoff Content is written through ONLY if we're already keeping it offline
 * (a `retention` row exists) — so a live edit to an offline-cached older article
 * stays fresh, while a below-cutoff doc we aren't caching is not persisted (it
 * would otherwise be written here and evicted on the next sync). DeleteCmds and
 * above-cutoff / non-Content docs are unaffected; the gate is inert when no cutoff
 * is configured (CMS). Exported so the persistence decision can be unit-tested
 * without a live socket.
 */
export async function applyLiveData(data: ApiDataResponseDto): Promise<void> {
    // Docs the client is allowed to store in IndexedDB (shared gate with
    // HybridQuery's offline-persistence path — see isSyncableDoc).
    const syncable = data.docs.filter(isSyncableDoc);

    const cutoff = getContentPublishDateCutoff();
    const isBelowCutoffContent = (d: BaseDocumentDto): boolean => {
        if (d.type !== DocType.Content) return false;
        const pd = (d as ContentDto).publishDate;
        return pd !== undefined && pd < cutoff;
    };

    const belowIds = syncable.filter(isBelowCutoffContent).map((d) => d._id);
    let keepBelow = new Set<string>();
    if (belowIds.length) {
        const stamps = await db.retention.bulkGet(belowIds);
        keepBelow = new Set(belowIds.filter((_id, i) => stamps[i] !== undefined));
    }

    const filtered = syncable.filter((d) => !isBelowCutoffContent(d) || keepBelow.has(d._id));

    await db.bulkPut(filtered);
}

/**
 * Subscribe the sync2 live persister to the Socket.io change feed. Registered once
 * at startup from {@link initSync}/`luminary.ts` — the socket re-fires its
 * listeners across reconnects, so a single registration is sufficient.
 */
export function initLiveSync(): void {
    if (_initialized) return;
    _initialized = true;
    getSocket().on("data", applyLiveData);

    // Drive Socket.io room subscriptions from what sync2 actually syncs. As syncList
    // grows (new groups/languages/types), the set of subscribed rooms widens to match;
    // held under sync2's stable base token so it composes with HybridQuery's per-query
    // subscriptions for non-synced types.
    watch(syncList, () => setBaseRooms(roomDocTypesFromSyncList()), {
        immediate: true,
        deep: true,
    });
}
