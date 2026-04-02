import { db } from "../../db/database";
import { BaseDocumentDto, DocType } from "../../types";
import { merge } from "./merge";
import { syncList } from "./state";
import { cancelSync } from "./sync";
import { SyncOptions } from "./types";
import { calcChunk, getChunkTypeString } from "./utils";

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

    // If the calculated range is inverted (blockStart < blockEnd), it means there are non-adjacent
    // chunks with a tiny gap that can't be filled. This can happen when boundary documents don't
    // overlap perfectly. Stop iteration to avoid infinite recursion.
    if (chunk.blockStart < chunk.blockEnd) {
        const mergeResult = merge(options);
        mergeResult.eof = true;
        return { ...mergeResult, firstSync };
    }

    const mangoQuery = {
        selector: {
            type: options.type,
            updatedTimeUtc: { $lte: chunk.blockStart, $gte: chunk.blockEnd }, // We are overlapping chunks by 1 entry to be able to merge chunks properly
            memberOf: {
                $elemMatch: { $in: options.memberOf },
            },
        } as any,
        limit: options.limit,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index:
            "sync-" + (options.subType ? options.subType + "-" : "") + options.type + "-index",
        cms: options.cms,
        identifier: "sync", // Identifier for the API query validation template
    };

    // Add parentType and language selectors to content queries
    if (options.type === DocType.Content && options.subType) {
        mangoQuery.selector.parentType = options.subType;
        mangoQuery.selector.language = { $in: options.languages || [] };
    }

    // Add docType selector for deleteCmd queries
    if (options.type === DocType.DeleteCmd && options.subType) {
        mangoQuery.selector.docType = options.subType;

        // Filter DeleteCmds by language for content-based delete commands
        if (options.languages && options.languages.length > 0) {
            mangoQuery.selector.language = { $in: options.languages };
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
    if (res.warning) console.warn("API warning received: ", res.warning);
    if (res.warnings && Array.isArray(res.warnings))
        res.warnings.forEach((w: string) => console.warn("API warning received: ", w));

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
        // Push chunk to chunk list
        syncList.value.push({
            chunkType: getChunkTypeString(options.type, options.subType),
            memberOf: options.memberOf,
            languages: options.languages,
            blockStart,
            blockEnd,
            eof: blockLength < options.limit, // If less than limit, we reached the end
        });
    }

    // Merge chunks
    let mergeResult = merge(options);

    // If not end of file (we have not yet received all documents from the API), continue to sync iteratively
    if (!mergeResult.eof) {
        // If the nextChunk's range is identical to the current one, it would iterate forever - quit recursion loop to prevent this
        const nextChunk = calcChunk({ ...options, initialSync: false });
        if (nextChunk.blockStart === chunk.blockStart && nextChunk.blockEnd === chunk.blockEnd) {
            mergeResult.eof = true;
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
