import { DocType } from "../../types";
import { syncList, syncTolerance } from "./state";
import type { SyncListEntry } from "./types";

/**
 * Calculate the blockStart and blockEnd values for the next API query for a give type and memberOf array.
 * Initial sync starts ahead of the latest known blockStart, while regular sync continues from the latest known blockEnd
 */
export function calcChunk(options: {
    type: string;
    memberOf: string[];
    initialSync: boolean;
    languages?: string[];
}): {
    blockStart: number;
    blockEnd: number;
} {
    const list = syncList.value
        .filter(filterByTypeMemberOf(options))
        .sort((a, b) => a.blockStart - b.blockStart);
    let blockStart: number;
    let blockEnd: number;

    if (options.initialSync || list.length === 0) blockStart = Number.MAX_SAFE_INTEGER;
    else blockStart = list[0].blockEnd;

    if (options.initialSync)
        blockEnd = list.length === 0 ? 0 : list[0].blockStart - syncTolerance; // add tolerance to push end into past of first synced blockStart giving an overlap to avoid missing documents
    else blockEnd = list.length <= 1 ? 0 : list[1].blockStart;

    return { blockStart, blockEnd };
}

/**
 * Get the list of memberOf groups used in the syncList for a given document type
 */
export function getGroups(options: { type: string }): string[] {
    const groups = new Set<string>();
    syncList.value
        .filter((entry) => entry.type === options.type)
        .forEach((entry) => {
            entry.memberOf.forEach((group) => groups.add(group));
        });
    return Array.from(groups);
}

/**
 * Get the list of unique memberOf group sets used in the syncList for a given document type
 */
export function getGroupSets(options: { type: string }): string[][] {
    const groupSets = new Set<string>();
    syncList.value
        .filter((entry) => entry.type === options.type)
        .forEach((entry) => {
            const key = entry.memberOf.sort().join("|");
            groupSets.add(key);
        });
    return Array.from(groupSets).map((key) => key.split("|"));
}

/**
 * Get the list of languages used in the syncList for content document types
 */
export function getLanguages(): string[] {
    const languages = new Set<string>();
    syncList.value
        .filter(
            (entry) =>
                entry.type === DocType.Content + ":" + DocType.Post ||
                entry.type === DocType.Content + ":" + DocType.Tag,
        )
        .forEach((entry) => {
            if (entry.languages) {
                entry.languages.forEach((lang) => languages.add(lang));
            }
        });
    return Array.from(languages);
}

/**
 * Filter function to filter syncList entries by type and memberOf, and optionally by languages
 */
export const filterByTypeMemberOf =
    (options: { type: string; memberOf: string[]; languages?: string[] }) =>
    (entry: SyncListEntry) => {
        const typeMatch = entry.type === options.type;
        const memberOfMatch = arraysEqual(entry.memberOf, options.memberOf);

        // If languages are provided in options, also check languages match
        if (options.languages !== undefined) {
            const languagesMatch = entry.languages
                ? arraysEqual(entry.languages, options.languages)
                : options.languages.length === 0;
            return typeMatch && memberOfMatch && languagesMatch;
        }

        return typeMatch && memberOfMatch;
    };

/**
 * Compares two string arrays for equality (same elements, regardless of order)
 */
export function arraysEqual(arr1: string[], arr2: string[]): boolean {
    if (arr1.length !== arr2.length) return false;
    const sorted1 = [...arr1].sort();
    const sorted2 = [...arr2].sort();
    return sorted1.every((value, index) => value === sorted2[index]);
}
