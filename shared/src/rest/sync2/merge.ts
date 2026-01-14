import { DocType } from "../../types";
import { syncList } from "./state";
import { filterByTypeMemberOf, getChunkTypeString } from "./utils";
import type { SyncBaseOptions } from "./types";

/**
 * Merge adjacent chunks vertically (by updatedTimeUtc) for the same type, memberOf, and languages.
 * This combines consecutive time-based chunks that share the same filtering criteria.
 */
export function mergeVertical(options: SyncBaseOptions) {
    // Filter chunks by type, memberOf, and languages (if provided)
    const filteredList = syncList.value.filter(filterByTypeMemberOf(options));

    // Set the default eof value to the first chunk's eof status to handle cases with no merges (only 1 chunk)
    let eof = filteredList.length ? filteredList[0].eof : false;

    // Sort in reverse order (newest first)
    filteredList.sort((a, b) => b.blockStart - a.blockStart);

    // Start from the newest chunk and move backwards (vertical merge for the same type, memberOf and languages)
    for (let i = 0; i < filteredList.length - 1; i++) {
        const current = filteredList[i];
        const next = filteredList[i + 1];

        if (
            current.blockEnd <= next.blockStart ||
            // handle responses which did not return any data
            next.blockStart === 0
        ) {
            // Merge chunks
            current.blockEnd = next.blockEnd === 0 ? current.blockEnd : next.blockEnd; // If next blockEnd is 0 (no data), keep current blockEnd
            current.eof = next.eof;
            if (next.eof) eof = true; // Set End of File flag

            // Remove next chunk from syncList
            const index = syncList.value.indexOf(next);
            if (index !== -1) {
                syncList.value.splice(index, 1);

                // Remove merged chunk from local list
                filteredList.splice(i + 1, 1);
            }

            i--; // Re-evaluate current index after merge
        }
    }

    // Calculate the final blockStart and blockEnd from the merged chunks
    const blockStart = filteredList.length ? filteredList[0].blockStart : 0;
    const blockEnd = filteredList.length ? filteredList[0].blockEnd : 0;

    return { eof, blockStart, blockEnd };
}

/**
 * Merge chunks horizontally (by memberOf groups and languages) for the same type.
 * Only chunks that have reached EOF can be merged horizontally.
 * This combines different memberOf groups and languages that have complete data for overlapping time ranges.
 */
export function mergeHorizontal(options: { type: DocType; subType?: DocType }) {
    const list = syncList.value.filter(
        (chunk) =>
            chunk.chunkType === getChunkTypeString(options.type, options.subType) && chunk.eof,
    );

    // If no chunks, return default values
    if (list.length === 0) return { blockStart: 0, blockEnd: 0 };

    // If only one chunk, no merge needed
    if (list.length === 1) return { blockStart: list[0].blockStart, blockEnd: list[0].blockEnd };

    // Do horizontal merge for adjacent chunks.
    // Only columns that have reached eof can be merged.
    for (let i = 0; i < list.length; i++) {
        const base = list[i];

        for (let j = 0; j < list.length; j++) {
            if (i === j) continue;
            const compare = list[j];

            // Merge memberOf groups
            const mergedGroups = Array.from(
                new Set([...base.memberOf, ...compare.memberOf]),
            ).sort();
            base.memberOf = mergedGroups;

            // Merge languages
            if (options.type === DocType.Content) {
                const mergedLanguages = Array.from(
                    new Set([...(base.languages || []), ...(compare.languages || [])]),
                ).sort();
                base.languages = mergedLanguages;
            }

            // Update blockStart and blockEnd
            base.blockStart = Math.max(base.blockStart, compare.blockStart);
            base.blockEnd = Math.min(base.blockEnd, compare.blockEnd);

            // Remove compare chunk
            const index = syncList.value.indexOf(compare);
            if (index !== -1) {
                syncList.value.splice(index, 1);

                // Remove merged chunk from local list
                list.splice(j, 1);
            }

            j--; // Re-evaluate j index after merge
        }
    }

    // Calculate the final blockStart and blockEnd from the merged chunks
    const blockStart = list[0].blockStart;
    const blockEnd = list[0].blockEnd;

    return { blockStart, blockEnd };
}

/**
 * Merge vertical and horizontal chunks
 */
export function merge(options: SyncBaseOptions) {
    // Merge vertical chunks
    const mergeResult = mergeVertical(options);

    // If end of file, perform horizontal merge with any complete columns
    if (mergeResult.eof) {
        const r = mergeHorizontal(options);
        mergeResult.blockStart = r.blockStart;
        mergeResult.blockEnd = r.blockEnd;
    }

    return mergeResult;
}
