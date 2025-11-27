import { DocType } from "../../types";
import { syncList, syncTolerance } from "./state";
import type { SyncBaseOptions, SyncListEntry } from "./types";

/**
 * Calculate the blockStart and blockEnd values for the next API query for a give type and memberOf array.
 * Initial sync starts ahead of the latest known blockStart, while regular sync continues from the latest known blockEnd
 */
export function calcChunk(options: {
    type: DocType;
    subType?: DocType;
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
export function getGroups(options: { type: DocType; subType?: DocType }): string[] {
    const chunkType = getChunkTypeString(options.type, options.subType);
    const groups = new Set<string>();

    syncList.value
        .filter((entry) => entry.chunkType === chunkType)
        .forEach((entry) => {
            entry.memberOf.forEach((group) => groups.add(group));
        });
    return Array.from(groups);
}

/**
 * Get the list of unique language group sets used in the syncList for a given document type, selected languages and optional subType.
 */
export function getLanguageSets(options: {
    type: DocType;
    subType?: DocType;
    languages?: string[];
}): string[][] {
    if (options.type !== DocType.Content) return [];
    if (!options.subType) return [];

    const chunkType = getChunkTypeString(options.type, options.subType);
    const languageSets = new Set<string>();

    syncList.value
        .filter((entry) => entry.chunkType === chunkType)
        .forEach((entry) => {
            if (!entry.languages || !Array.isArray(entry.languages)) return;

            if (entry.languages.every((lang) => options.languages?.includes(lang))) {
                // If all languages in entry are in the options.languages, use the entry's languages
                const key = entry.languages.sort().join("|");
                languageSets.add(key);
            }
        });
    return Array.from(languageSets).map((key) => key.split("|"));
}

/**
 * Get the list of unique memberOf group sets used in the syncList for a given document type (and optional subType).
 */
export function getGroupSets(options: {
    type: DocType;
    subType?: DocType;
    memberOf: string[];
}): string[][] {
    const chunkType = getChunkTypeString(options.type, options.subType);
    const groupSets = new Set<string>();

    syncList.value
        .filter((entry) => entry.chunkType === chunkType)
        .forEach((entry) => {
            if (entry.memberOf.every((group) => options.memberOf.includes(group))) {
                // If all groups in entry are in the options.memberOf, use the entry's memberOf
                const key = entry.memberOf.sort().join("|");
                groupSets.add(key);
            }
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
                entry.chunkType === getChunkTypeString(DocType.Content, DocType.Post) ||
                entry.chunkType === getChunkTypeString(DocType.Content, DocType.Tag),
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
export const filterByTypeMemberOf = (options: SyncBaseOptions) => (entry: SyncListEntry) => {
    const { type, subType } = splitChunkTypeString(entry.chunkType);

    if (type !== options.type) return false;
    if (subType !== options.subType) return false;
    if (!arraysEqual(entry.memberOf, options.memberOf)) return false;

    // If languages are provided in options, also check languages match
    if (options.languages !== undefined) {
        const languagesMatch = entry.languages
            ? arraysEqual(entry.languages, options.languages)
            : options.languages.length === 0;
        if (!languagesMatch) return false;
    }

    return true;
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

/**
 * Split a combined chunk type string into its document type and optional subtype (parentType for content documents or docType for delete commands).
 */
export function splitChunkTypeString(type: string): { type: DocType; subType?: DocType } {
    const [docType, subType] = type.split(":") as [DocType, DocType | undefined];
    return { type: docType, subType };
}

/**
 * Get the chunk type string for a given document type and optional subtype (parentType for content documents or docType for delete commands).
 */
export function getChunkTypeString(type: DocType, subType?: DocType): string {
    return subType ? `${type}:${subType}` : type;
}
