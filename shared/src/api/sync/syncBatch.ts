import { db } from "../../db/database";
import { BaseDocumentDto, DocType } from "../../types";
import { buildSyncQuery } from "./query";
import { syncBatchStable } from "./syncBatchStable";
import { merge } from "./merge";
import { syncListOf, syncTolerance, tuplePaginationSupported } from "./state";
import { cancelSync, syncCancellationGeneration } from "./sync";
import { SyncOptions } from "./types";
import { reportBreadcrumb } from "../../diagnostics";
import { calcChunk, filterByTypeMemberOf, getChunkTypeString, resolveRange } from "./utils";

/**
 * Persist eof = true onto the frontier (newest) chunk of the given column. The stall / inverted-range
 * guards decide a column is as complete as it can get, but historically only set eof on the returned
 * value, never on the stored entry — leaving the column at eof:false forever, which blocks it from
 * ever merging horizontally. Marking the stored frontier chunk lets the column merge.
 */
function markColumnEof(options: SyncOptions) {
    const entries = syncListOf(options.source).value.filter(filterByTypeMemberOf(options));
    if (!entries.length) return;
    const frontier = entries.reduce((a, b) => (a.blockStart >= b.blockStart ? a : b));
    frontier.eof = true;
}

/**
 * Perform an iterative vertical sync (for given type and memberOf groups), and merge chunks as they are fetched.
 * Finally perform horizontal merge if end of file is reached.
 */
export async function syncBatch(options: SyncOptions) {
    if (options.pagination) return syncBatchStable(options);
    const generation = syncCancellationGeneration;
    const capability = tuplePaginationSupported.value;
    const cancelled = () =>
        cancelSync ||
        generation !== syncCancellationGeneration ||
        capability !== tuplePaginationSupported.value ||
        !!options.isCancelled?.() ||
        !!options.source?.isCancelled?.();
    const listRef = syncListOf(options.source);
    // Check if sync has been cancelled before proceeding
    if (cancelled()) {
        return;
    }
    const chunk = calcChunk(options);

    // If the blockEnd is calculated at 0, it means that there are no existing syncList entries, indicating
    // that this is the first sync for this type and memberOf groups.
    const firstSync = chunk.blockEnd === 0;

    // If the calculated range is inverted (blockStart < blockEnd) AND the inversion is within
    // `syncTolerance`, treat it as the intended sub-tolerance boundary gap — stop iteration and
    // seal the frontier to avoid infinite recursion on identical chunks.
    //
    // A WIDE inversion (much larger than syncTolerance) means calcChunk produced an actual
    // unfilled inter-column gap (e.g. two same-key columns at distinct updatedTimeUtc windows).
    // Sealing the frontier there would falsely mark the column complete while leaving days of
    // data unfetched. In that case fall through so the gap-fill / vertical-merge paths can
    // resolve it instead of prematurely declaring eof.
    if (chunk.blockStart < chunk.blockEnd && chunk.blockEnd - chunk.blockStart <= syncTolerance) {
        const mergeResult = merge(options);
        mergeResult.eof = true;
        markColumnEof(options);
        await options.source?.setSyncList();
        return { ...mergeResult, firstSync };
    }

    const mangoQuery = buildSyncQuery(options, chunk);

    // Check if sync has been cancelled before making API request
    if (cancelled()) {
        return;
    }

    const res = await options.httpService.post(options.source?.queryPath ?? "query", mangoQuery);

    // Check if sync was cancelled during the API call
    if (cancelled()) {
        return;
    }

    if (!res || !res.docs || !Array.isArray(res.docs))
        throw new Error("Invalid API response format");

    // Surface API warnings (e.g. CouchDB "documents examined is high") together with the exact
    // query + index that triggered them, so the offending sync column is identifiable.
    const apiWarnings: string[] = [
        ...(res.warning ? [res.warning] : []),
        ...(Array.isArray(res.warnings) ? res.warnings : []),
    ];
    if (apiWarnings.length) {
        const queryDetails = {
            use_index: mangoQuery.use_index,
            selector: mangoQuery.selector,
            sort: mangoQuery.sort,
            limit: mangoQuery.limit,
            resultCount: res.docs.length,
        };
        for (const w of apiWarnings) {
            console.warn("[sync] API warning received:", w, queryDetails);
            reportBreadcrumb(`Sync API warning: ${w}`, {
                area: "sync",
                op: "api-warning",
                data: queryDetails,
            });
        }
    }

    // Get the block start and end timestamps.
    // When no docs are returned, use the queried range boundaries so the chunk correctly
    // represents the empty range that was checked, enabling proper merge with existing chunks.
    const fetchedDocs = res.docs as Array<BaseDocumentDto>;
    const blockLength = fetchedDocs.length;
    const blockStart = fetchedDocs.length ? fetchedDocs[0].updatedTimeUtc : chunk.blockStart;
    let blockEnd = fetchedDocs.length
        ? fetchedDocs[fetchedDocs.length - 1].updatedTimeUtc
        : chunk.blockEnd;

    // When eof is reached (fewer docs than limit), extend blockEnd to cover the full
    // queried range. This ensures the chunk represents the entire range that was verified
    // to have no more data, which is critical for proper merging on sync resume.
    if (blockLength < options.limit && blockLength > 0) {
        blockEnd = Math.min(blockEnd, chunk.blockEnd);
    }

    // Upsert to IndexedDB
    if (fetchedDocs.length) {
        if (options.source) await options.source.put(fetchedDocs);
        else await db.bulkPut(fetchedDocs);
        if (cancelled()) return;
        // publishDate is a Content-only sync dimension. For non-Content types (Language,
        // Redirect, Storage, AuthProvider, Group, …) the docs have no publishDate field and
        // every comparison path against these bounds wraps in `if (type === Content)`, so
        // setting them on the entry is dead weight. DeleteCmd pushes go through sync.ts (not
        // here) and explicitly use OPEN_MIN/MAX — see `if (!hasDeleteCmdEntries)`.
        const isContent = options.type === DocType.Content;
        const { min: publishDateMin, max: publishDateMax } = isContent
            ? resolveRange(options.publishDateMin, options.publishDateMax)
            : { min: undefined, max: undefined };
        // Push chunk to chunk list
        listRef.value.push({
            chunkType: getChunkTypeString(options.type, options.subType, options.alwaysOffline),
            memberOf: options.memberOf,
            languages: options.languages,
            blockStart,
            blockEnd,
            // EOF only when this query actually reached the bottom of the timeline (floor 0).
            // A catch-up window (floor = blockStart - tolerance, when resuming an existing column)
            // returning < limit does NOT mean the column is complete — there may be older data
            // below blockEnd that must still be fetched by the downward continuation. Inferring EOF
            // from such a narrow window falsely seals an incomplete column.
            eof: blockLength < options.limit && chunk.blockEnd === 0,
            publishDateMin,
            publishDateMax,
        });
        if (
            blockLength === options.limit &&
            fetchedDocs.every((doc) => doc.updatedTimeUtc === blockStart)
        ) {
            if (options.source) await options.source.setSyncList();
            else await db.setSyncList?.();
            throw new Error(
                "Sync pagination stalled at a full timestamp; an updated API is required",
            );
        }
    }

    // Merge chunks
    let mergeResult = merge(options);

    // If not end of file (we have not yet received all documents from the API), continue to sync iteratively
    if (!mergeResult.eof) {
        // If the nextChunk's range is identical to the current one, it would iterate forever
        const nextChunk = calcChunk({ ...options, initialSync: false });
        if (nextChunk.blockStart === chunk.blockStart && nextChunk.blockEnd === chunk.blockEnd) {
            mergeResult.eof = true;
            markColumnEof(options);
            await options.source?.setSyncList();
            return { ...mergeResult, firstSync };
        }

        // Commit each page before requesting the next one, including interrupted pulls.
        await options.source?.setSyncList();
        mergeResult =
            (await syncBatch({
                ...options,
                initialSync: false,
            })) || mergeResult;
    } else {
        await options.source?.setSyncList();
    }

    return { ...mergeResult, firstSync };
}
