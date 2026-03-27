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
 * Uses an iterative loop instead of recursion to prevent call stack overflows when many batches are needed.
 */
export async function syncBatch(options: SyncOptions) {
    let currentOptions: SyncOptions = options;
    let firstSync: boolean | undefined;
    let mergeResult = { eof: false, blockStart: 0, blockEnd: 0 };
    let continueSync = true;

    while (continueSync) {
        // Check if sync has been cancelled before proceeding
        if (cancelSync) {
            return;
        }

        const chunk = calcChunk(currentOptions);

        // Record firstSync on the first iteration only: blockEnd=0 means no prior entries exist
        if (firstSync === undefined) {
            firstSync = chunk.blockEnd === 0;
        }

        // If the calculated range is inverted (blockStart < blockEnd), it means there are non-adjacent
        // chunks with a tiny gap that can't be filled. This can happen when boundary documents don't
        // overlap perfectly. Stop iteration to avoid an infinite loop.
        if (chunk.blockStart < chunk.blockEnd) {
            mergeResult = merge(currentOptions);
            mergeResult.eof = true;
            continueSync = false;
        } else {
            const mangoQuery = {
                selector: {
                    type: currentOptions.type,
                    updatedTimeUtc: { $lte: chunk.blockStart, $gte: chunk.blockEnd }, // We are overlapping chunks by 1 entry to be able to merge chunks properly
                    memberOf: {
                        $elemMatch: { $in: currentOptions.memberOf },
                    },
                } as any,
                limit: currentOptions.limit,
                sort: [{ updatedTimeUtc: "desc" }],
                use_index:
                    "sync-" +
                    (currentOptions.subType ? currentOptions.subType + "-" : "") +
                    currentOptions.type +
                    "-index",
                cms: currentOptions.cms,
                identifier: "sync", // Identifier for the API query validation template
            };

            // Add parentType and language selectors to content queries
            if (currentOptions.type === DocType.Content && currentOptions.subType) {
                mangoQuery.selector.parentType = currentOptions.subType;
                mangoQuery.selector.language = { $in: currentOptions.languages || [] };
            }

            // Add docType selector for deleteCmd queries
            if (currentOptions.type === DocType.DeleteCmd && currentOptions.subType) {
                mangoQuery.selector.docType = currentOptions.subType;

                // Filter DeleteCmds by language for content-based delete commands
                if (currentOptions.languages && currentOptions.languages.length > 0) {
                    mangoQuery.selector.language = { $in: currentOptions.languages };
                }
            }

            // Check if sync has been cancelled before making API request
            if (cancelSync) {
                return;
            }

            const res = await currentOptions.httpService.post("query", mangoQuery);

            // Check if sync was cancelled during the API call
            if (cancelSync) {
                return;
            }

            if (!res.docs || !Array.isArray(res.docs)) throw new Error("Invalid API response format");
            if (res.warning) console.warn("API warning received: ", res.warning);
            if (res.warnings && Array.isArray(res.warnings))
                res.warnings.forEach((w: string) => console.warn("API warning received: ", w));

            // Get the block start and end timestamps.
            // When no docs are returned and this was a top-of-range initial query (blockStart = MAX_SAFE_INTEGER),
            // use Date.now() instead of MAX_SAFE_INTEGER. This prevents subsequent syncs from computing
            // blockEnd ≈ MAX_SAFE_INTEGER and missing all real documents created after this empty sync.
            // For gap-filling queries (blockStart is a real timestamp), use chunk.blockStart as-is.
            const fetchedDocs = res.docs as Array<BaseDocumentDto>;
            const blockLength = fetchedDocs.length;
            const blockStart = fetchedDocs.length
                ? fetchedDocs[0].updatedTimeUtc
                : chunk.blockStart === Number.MAX_SAFE_INTEGER
                  ? Date.now()
                  : chunk.blockStart;
            let blockEnd = fetchedDocs.length
                ? fetchedDocs[fetchedDocs.length - 1].updatedTimeUtc
                : chunk.blockEnd;

            // When eof is reached (fewer docs than limit), extend blockEnd to cover the full
            // queried range. This ensures the chunk represents the entire range that was verified
            // to have no more data, which is critical for proper merging on sync resume.
            if (blockLength < currentOptions.limit && blockLength > 0) {
                blockEnd = Math.min(blockEnd, chunk.blockEnd);
            }

            // Upsert to IndexedDB
            if (fetchedDocs.length) await db.bulkPut(fetchedDocs);

            // Push chunk to chunk list
            syncList.value.push({
                chunkType: getChunkTypeString(currentOptions.type, currentOptions.subType),
                memberOf: currentOptions.memberOf,
                languages: currentOptions.languages,
                blockStart,
                blockEnd,
                eof: blockLength < currentOptions.limit, // If less than limit, we reached the end
            });

            // Merge chunks
            mergeResult = merge(currentOptions);

            if (mergeResult.eof) {
                // All documents received — stop iterating
                continueSync = false;
            } else {
                // Continue to next batch, switching to non-initial sync mode
                currentOptions = { ...options, initialSync: false };
            }
        }
    }

    return { ...mergeResult, firstSync: firstSync ?? true };
}
