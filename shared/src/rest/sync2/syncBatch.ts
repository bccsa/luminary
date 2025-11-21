import { db } from "../../db/database";
import { BaseDocumentDto, DocType } from "../../types";
import { mergeHorizontal, mergeVertical } from "./merge";
import { syncList } from "./state";
import { cancelSync } from "./sync";
import { SyncOptions } from "./types";
import { calcChunk } from "./utils";

/**
 * Perform an iterative vertical sync (for given type and memberOf groups), and merge chunks as they are fetched.
 * Finally perform horizontal merge if end of file is reached.
 */
export async function syncBatch(options: SyncOptions): Promise<void> {
    // Check if sync has been cancelled before proceeding
    if (cancelSync) {
        return;
    }
    const chunk = calcChunk({
        type: options.type,
        memberOf: options.memberOf,
        initialSync: options.initialSync,
    });

    const mangoQuery = {
        selector: {
            type: options.docType,
            updatedTimeUtc: { $lte: chunk.blockStart, $gte: chunk.blockEnd }, // We are overlapping chunks by 1 entry to be able to merge chunks properly
            memberOf: {
                $elemMatch: { $in: options.memberOf },
            },
        } as any,
        limit: options.limit,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index:
            "sync-" +
            (options.parentType ? options.parentType + "-" : "") +
            options.docType +
            "-index",
    };

    // Add parentType and language selectors to content queries
    if (options.docType === DocType.Content && options.parentType) {
        mangoQuery.selector.parentType = options.parentType;
        mangoQuery.selector.language = { $in: options.languages || [] };
    }

    // Add the CMS flag if present
    if (options.cms) {
        mangoQuery.selector.cms = true;
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
        type: options.type,
        memberOf: options.memberOf,
        languages: options.languages,
        blockStart,
        blockEnd,
        eof: blockLength < options.limit, // If less than limit, we reached the end
    });

    // Merge vertical chunks
    const { eof } = mergeVertical(options.type);

    // If end of file, perform horizontal merge with any complete columns
    if (eof) {
        mergeHorizontal(options.type);
    } else {
        // Check if sync has been cancelled before continuing to next chunk
        if (cancelSync) {
            return;
        }

        // Continue syncing next chunk
        await syncBatch({
            ...options,
            initialSync: false,
        });
    }
}
