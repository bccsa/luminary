import { DocType } from "../../types";
import { syncList } from "./state";
import { arraysEqual } from "./utils";

/**
 * Merge adjacent chunks vertically (by updatedTimeUtc) for the same type, memberOf, and languages.
 * This combines consecutive time-based chunks that share the same filtering criteria.
 *
 * @param type - Document type or combined type and subtype (e.g., "content:post") to merge.
 */
export function mergeVertical(type: string) {
    const list = syncList.value
        .filter((chunk) => chunk.type === type)
        .sort((a, b) => a.blockStart - b.blockStart);

    let eof = false;

    // Start from the newest chunk and move backwards (vertical merge for the same type, memberOf and languages)
    for (let i = 0; i < list.length - 1; i++) {
        const current = list[i];
        const next = list[i + 1];

        if (
            current.type === next.type &&
            arraysEqual(current.memberOf, next.memberOf) &&
            arraysEqual(current.languages || [], next.languages || []) &&
            (current.blockEnd <= next.blockStart ||
                // handle responses which did not return any data
                next.blockStart === 0)
        ) {
            // Merge chunks
            current.blockEnd = next.blockEnd;
            current.eof = next.eof;
            if (next.eof) eof = true; // Set End of File flag

            // Remove next chunk
            const index = syncList.value.indexOf(next);
            if (index !== -1) {
                syncList.value.splice(index, 1);
            }
            i--; // Re-evaluate current index after merge
        }
    }

    return { eof };
}

/**
 * Merge chunks horizontally (by memberOf groups and languages) for the same type.
 * Only chunks that have reached EOF can be merged horizontally.
 * This combines different memberOf groups and languages that have complete data for overlapping time ranges.
 *
 * @param type - Document type or combined type and subtype (e.g., "content:post") to merge.
 */
export function mergeHorizontal(type: string): void {
    const list = syncList.value
        .filter((chunk) => chunk.type === type)
        .sort((a, b) => a.blockStart - b.blockStart);

    // Do horizontal merge for adjacent chunks with overlapping updatedTimeUtc ranges.
    // Only columns that have reached eof can be merged.
    for (let i = 0; i < list.length; i++) {
        const base = list[i];
        if (!base.eof) continue;

        for (let j = 0; j < list.length; j++) {
            if (i === j) continue;
            const compare = list[j];
            if (base.type !== compare.type) continue;
            if (!compare.eof) continue;

            // Merge memberOf groups
            const mergedGroups = Array.from(
                new Set([...base.memberOf, ...compare.memberOf]),
            ).sort();
            base.memberOf = mergedGroups;

            // Merge languages
            if (base.type === DocType.Content) {
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
            }
            j--; // Re-evaluate j index after merge
        }
    }
}
