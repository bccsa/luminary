import { DocType, type ApiDataResponseDto, type BaseDocumentDto, type ContentDto } from "../../types";
import { db } from "../../db/database";
import { isSyncableDoc } from "../../db/isSyncable";
import { getLiveStream } from "../../liveStream/liveStream";
import { getContentPublishDateCutoff } from "../../config";

let _initialized = false;

/**
 * Apply one live-stream `"data"` batch to IndexedDB.
 *
 * The live stream is a pure transport — it does not decide what to persist. This is
 * where that decision lives: incoming live updates are filtered through
 * `isSyncableDoc` (the sync-`syncList`-derived gate), and the result is written
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
        const content = d as ContentDto;
        if (content.parentAlwaysOffline === true) return false;
        const pd = content.publishDate;
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
 * Subscribe the sync live persister to the live change feed. Registered once
 * at startup from {@link initSync}/`luminary.ts` — the socket re-fires its
 * listeners across reconnects, so a single registration is sufficient.
 */
export function initLiveSync(): void {
    if (_initialized) return;
    _initialized = true;
    getLiveStream().on("data", applyLiveData);
}
