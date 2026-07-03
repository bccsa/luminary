import { db } from "../../db/database";
import { BaseDocumentDto, DocType } from "../../types";
import { contentLanguageKeepSelector } from "./keepSelector";
import { merge } from "./merge";
import { syncList, syncTolerance } from "./state";
import { cancelSync } from "./sync";
import { SyncOptions } from "./types";
import {
    calcChunk,
    filterByTypeMemberOf,
    getChunkTypeString,
    OPEN_MAX,
    OPEN_MIN,
    resolveRange,
} from "./utils";

/**
 * Persist eof = true onto the frontier (newest) chunk of the given column. The stall / inverted-range
 * guards decide a column is as complete as it can get, but historically only set eof on the returned
 * value, never on the stored entry — leaving the column at eof:false forever, which blocks it from
 * ever merging horizontally. Marking the stored frontier chunk lets the column merge.
 */
function markColumnEof(options: SyncOptions) {
    const entries = syncList.value.filter(filterByTypeMemberOf(options));
    if (!entries.length) return;
    const frontier = entries.reduce((a, b) => (a.blockStart >= b.blockStart ? a : b));
    frontier.eof = true;
}

/**
 * Perform an iterative vertical sync (for given type and memberOf groups), and merge chunks as they are fetched.
 * Finally perform horizontal merge if end of file is reached.
 */
export async function syncBatch(options: SyncOptions) {
    // Check if sync has been cancelled before proceeding
    if (cancelSync) {
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
    if (
        chunk.blockStart < chunk.blockEnd &&
        chunk.blockEnd - chunk.blockStart <= syncTolerance
    ) {
        const mergeResult = merge(options);
        mergeResult.eof = true;
        markColumnEof(options);
        return { ...mergeResult, firstSync };
    }

    const mangoQuery: any = {
        selector: {
            type: options.type,
            updatedTimeUtc: { $lte: chunk.blockStart, $gte: chunk.blockEnd }, // We are overlapping chunks by 1 entry to be able to merge chunks properly
            memberOf: {
                $elemMatch: { $in: options.memberOf },
            },
        },
        limit: options.limit,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index:
            options.type === DocType.Content && options.alwaysOfflineOnly
                ? "sync-content-alwaysOffline-index"
                : options.type === DocType.Content
                  ? "sync-content-index"
                  : "sync-" +
                    (options.subType ? options.subType + "-" : "") +
                    options.type +
                    "-index",
        cms: options.cms,
        identifier: "sync", // Identifier for the API query validation template
    };

    if (options.type === DocType.Content && !options.cms && !firstSync) {
        mangoQuery.includeExpired = true;
    }

    // Add parentType and language selectors to content queries
    if (options.type === DocType.Content && options.subType) {
        mangoQuery.selector.parentType = options.subType;
        const langs = options.languages || [];
        if (options.cms) {
            // CMS syncs all available languages: a flat membership returns all content, and the
            // set-based keep's fallback branch would be vacuous while bloating the selector with
            // one negation per language. So CMS keeps the simple flat filter.
            mangoQuery.selector.language = { $in: langs };
        } else if (langs.length) {
            // App: set-based priority-fallback keep (shared with the live gate via
            // contentLanguageKeepSelector) — a synced language OR the last-resort fallback
            // translation. Downloads exactly the set the local read can later pick the best
            // translation from, offline, with no per-feed API supplement. ANDed with the existing
            // top-level equality keys (CouchDB implicit-ANDs top-level fields with the injected $or).
            Object.assign(mangoQuery.selector, contentLanguageKeepSelector(langs));
        } else {
            // Empty language set → match nothing (don't let an absent set fetch the whole corpus).
            mangoQuery.selector.language = { $in: [] };
        }
        if (options.alwaysOfflineOnly) {
            mangoQuery.selector.parentAlwaysOffline = true;
        }
    }

    // Add docType selector for deleteCmd queries. DeleteCmds are language-UNSCOPED: a delete of any
    // downloaded doc — including a non-synced fallback translation, whose DeleteCmd carries that
    // (non-synced) language — must propagate, or the doc would linger in IndexedDB forever. DeleteCmds
    // are tiny, so fetching every language's content DeleteCmds is cheap.
    if (options.type === DocType.DeleteCmd && options.subType) {
        mangoQuery.selector.docType = options.subType;
    }

    // Inject publishDate range selector for Content queries when the range is narrowed.
    // DeleteCmd queries are intentionally never publishDate-filtered so deletes propagate
    // regardless of the user's cutoff. When both bounds are at defaults the selector is
    // omitted so the wire format stays byte-identical to clients that don't use publishDate.
    if (options.type === DocType.Content && !options.alwaysOfflineOnly) {
        const pdMin = options.publishDateMin ?? OPEN_MIN;
        const pdMax = options.publishDateMax ?? OPEN_MAX;
        const isNarrowed = pdMin > OPEN_MIN || pdMax < OPEN_MAX;
        if (isNarrowed) {
            const pd: { $gte?: number; $lte?: number } = {};
            if (pdMin > OPEN_MIN) pd.$gte = pdMin;
            if (pdMax < OPEN_MAX) pd.$lte = pdMax;
            mangoQuery.selector.publishDate = pd;
        }
    }

    // Check if sync has been cancelled before making API request
    if (cancelSync) {
        return;
    }

    const res = await options.httpService.post("query", mangoQuery);

    // Check if sync was cancelled during the API call
    if (cancelSync) {
        return;
    }

    if (!res.docs || !Array.isArray(res.docs)) throw new Error("Invalid API response format");

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
        await db.bulkPut(fetchedDocs);
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
        syncList.value.push({
            chunkType: getChunkTypeString(
                options.type,
                options.subType,
                options.alwaysOfflineOnly,
            ),
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
            return { ...mergeResult, firstSync };
        }

        mergeResult =
            (await syncBatch({
                ...options,
                initialSync: false,
            })) || mergeResult;
    }

    return { ...mergeResult, firstSync };
}
