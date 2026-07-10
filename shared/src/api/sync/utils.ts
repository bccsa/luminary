import { DocType } from "../../types";
import { syncList, syncTolerance } from "./state";
import type { SyncBaseOptions, SyncListEntry } from "./types";

/**
 * Sentinel values for "open" / unset publishDate bounds.
 * Use Number.MIN_SAFE_INTEGER / Number.MAX_SAFE_INTEGER (NOT -Infinity / +Infinity)
 * so the values survive JSON serialization through CouchDB and the POST /query selector.
 */
export const OPEN_MIN = Number.MIN_SAFE_INTEGER;
export const OPEN_MAX = Number.MAX_SAFE_INTEGER;

/**
 * A resolved inclusive numeric range.
 */
export type DateRange = { min: number; max: number };

/**
 * Resolve optional min/max to a concrete DateRange. Unset bounds default to
 * OPEN_MIN/OPEN_MAX so all downstream code sees numbers.
 */
export function resolveRange(min?: number, max?: number): DateRange {
    return {
        min: min ?? OPEN_MIN,
        max: max ?? OPEN_MAX,
    };
}

/**
 * True iff `inner` is fully contained within `outer` (inclusive bounds).
 */
export function isRangeSubsetOf(inner: DateRange, outer: DateRange): boolean {
    return inner.min >= outer.min && inner.max <= outer.max;
}

/**
 * True iff two ranges either overlap or are immediately adjacent
 * (i.e. mergeable into a single contiguous range with no gap).
 */
export function rangesAdjacentOrOverlap(a: DateRange, b: DateRange): boolean {
    // Overlap: max(a.min, b.min) <= min(a.max, b.max).
    // Adjacency on integer-style timestamps: bounds touch (a.max + 1 === b.min, etc.).
    if (a.max < b.min) return a.max + 1 >= b.min;
    if (b.max < a.min) return b.max + 1 >= a.min;
    return true;
}

/**
 * Return the smallest range that contains both `a` and `b`. Only meaningful
 * when the two ranges are adjacent-or-overlapping.
 */
export function mergeRanges(a: DateRange, b: DateRange): DateRange {
    return {
        min: Math.min(a.min, b.min),
        max: Math.max(a.max, b.max),
    };
}

/**
 * Compute the parts of `target` that are not covered by any range in `covered`.
 * Returns an array of disjoint sub-ranges (possibly empty if fully covered).
 */
export function subtractRanges(target: DateRange, covered: DateRange[]): DateRange[] {
    // Normalize: clip to target and sort by min.
    const clipped = covered
        .map((r) => ({
            min: Math.max(r.min, target.min),
            max: Math.min(r.max, target.max),
        }))
        .filter((r) => r.min <= r.max)
        .sort((a, b) => a.min - b.min);

    // Merge any overlapping/adjacent clipped ranges so the subtraction loop is clean.
    const merged: DateRange[] = [];
    for (const r of clipped) {
        const last = merged[merged.length - 1];
        if (last && rangesAdjacentOrOverlap(last, r)) {
            last.max = Math.max(last.max, r.max);
        } else {
            merged.push({ ...r });
        }
    }

    const result: DateRange[] = [];
    let cursor = target.min;
    for (const r of merged) {
        if (r.min > cursor) {
            result.push({ min: cursor, max: r.min - 1 });
        }
        if (r.max >= cursor) cursor = r.max + 1;
        if (cursor > target.max) break;
    }
    if (cursor <= target.max) {
        result.push({ min: cursor, max: target.max });
    }
    return result;
}

/**
 * Return the unique resolved publishDate ranges already present in the syncList
 * for the given chunkType (type + optional subType). Used by the column-spawn
 * logic in `_sync` to detect when a new publishDate window needs its own runner.
 */
export function getPublishDateRanges(options: {
    type: DocType;
    subType?: DocType;
    alwaysOffline?: boolean;
}): DateRange[] {
    const chunkType = getChunkTypeString(options.type, options.subType, options.alwaysOffline);
    const seen = new Set<string>();
    const ranges: DateRange[] = [];

    syncList.value
        .filter((entry) => entry.chunkType === chunkType)
        .forEach((entry) => {
            const r = resolveRange(entry.publishDateMin, entry.publishDateMax);
            const key = `${r.min}|${r.max}`;
            if (!seen.has(key)) {
                seen.add(key);
                ranges.push(r);
            }
        });

    return ranges;
}

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
 * Filter function to filter syncList entries by type, memberOf, and optionally by languages.
 * Also requires equality on the resolved publishDateMin/Max range so that entries belonging
 * to different publishDate windows are treated as separate columns.
 */
export const filterByTypeMemberOf = (options: SyncBaseOptions) => (entry: SyncListEntry) => {
    const { type, subType, alwaysOffline: entryOffline } = splitChunkTypeString(
        entry.chunkType,
    );
    if ((entryOffline ?? false) !== (options.alwaysOffline ?? false)) return false;

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

    // Range equality on resolved bounds. Unset (undefined) on either side resolves to
    // the open sentinels, so a legacy entry (no publishDate fields) matches an options
    // object that also leaves them open.
    const entryRange = resolveRange(entry.publishDateMin, entry.publishDateMax);
    const optionsRange = resolveRange(options.publishDateMin, options.publishDateMax);
    if (entryRange.min !== optionsRange.min || entryRange.max !== optionsRange.max) return false;

    return true;
};

/**
 * Compares two string arrays for multiset equality (same elements + counts, regardless of order).
 * Single-pass via a Map — avoids the double sorted-array allocation of a sort-based approach,
 * which matters on hot paths like `filterByTypeMemberOf` that run per syncList entry per merge.
 */
export function arraysEqual(arr1: string[], arr2: string[]): boolean {
    if (arr1.length !== arr2.length) return false;
    if (arr1.length === 0) return true;
    const counts = new Map<string, number>();
    for (const v of arr1) counts.set(v, (counts.get(v) ?? 0) + 1);
    for (const v of arr2) {
        const c = counts.get(v);
        if (c === undefined) return false;
        if (c === 1) counts.delete(v);
        else counts.set(v, c - 1);
    }
    return counts.size === 0;
}

/**
 * Split a combined chunk type string into its document type and optional subtype (parentType for content documents or docType for delete commands).
 */
export function splitChunkTypeString(type: string): {
    type: DocType;
    subType?: DocType;
    alwaysOffline?: boolean;
} {
    const alwaysOffline = type.endsWith(":alwaysOffline");
    const stripped = alwaysOffline ? type.slice(0, -":alwaysOffline".length) : type;
    const [docType, subType] = stripped.split(":") as [DocType, DocType | undefined];
    return { type: docType, subType, alwaysOffline: alwaysOffline || undefined };
}

/**
 * Get the chunk type string for a given document type and optional subtype (parentType for content documents or docType for delete commands).
 */
export function getChunkTypeString(
    type: DocType,
    subType?: DocType,
    alwaysOffline?: boolean,
): string {
    const base = subType ? `${type}:${subType}` : type;
    return alwaysOffline ? `${base}:alwaysOffline` : base;
}
