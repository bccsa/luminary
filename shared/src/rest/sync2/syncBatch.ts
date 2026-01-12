import { db } from "../../db/database";
import { BaseDocumentDto, DocType } from "../../types";
import { mergeHorizontal, mergeVertical } from "./merge";
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

    // Merge vertical chunks to ensure adjacent chunks are merged before attempting to fetch new chunk
    // to handle cases where sync was canceled or terminated before merging could occur.
    mergeVertical(options);

    const chunk = calcChunk(options);

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

    // Get the block start and end timestamps
    const fetchedDocs = res.docs as Array<BaseDocumentDto>;
    const blockStart = fetchedDocs.length ? fetchedDocs[0].updatedTimeUtc : 0;
    const blockEnd = fetchedDocs.length ? fetchedDocs[fetchedDocs.length - 1].updatedTimeUtc : 0;
    const blockLength = fetchedDocs.length;

    // Upsert to IndexedDB
    if (fetchedDocs.length) await db.bulkPut(fetchedDocs);

    // Push chunk to chunk list
    syncList.value.push({
        chunkType: getChunkTypeString(options.type, options.subType),
        memberOf: options.memberOf,
        languages: options.languages,
        blockStart,
        blockEnd,
        eof: blockLength < options.limit, // If less than limit, we reached the end
    });

    // Merge vertical chunks
    let mergeResult: {
        blockStart: number;
        blockEnd: number;
        eof: boolean | undefined;
        firstSync?: boolean;
    } = mergeVertical(options);

    // If end of file, perform horizontal merge with any complete columns
    if (mergeResult.eof) {
        const r = mergeHorizontal(options);
        mergeResult.blockStart = r.blockStart;
        mergeResult.blockEnd = r.blockEnd;
    } else {
        // Check if sync has been cancelled before continuing to next chunk
        if (cancelSync) {
            return;
        }

        // Continue syncing next chunk
        mergeResult =
            (await syncBatch({
                ...options,
                initialSync: false,
            })) || mergeResult;
    }

    return { ...mergeResult, firstSync: chunk.blockEnd === 0 };
}
