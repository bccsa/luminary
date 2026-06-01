import { DocType } from "../../types";
import { syncList } from "./state";
import { SyncBaseOptions } from "./types";
import {
    getChunkTypeString,
    OPEN_MAX,
    OPEN_MIN,
    resolveRange,
    splitChunkTypeString,
} from "./utils";

/**
 * Trim unused languages and memberOf groups from existing syncListEntries.
 * This prevents unused group/language buildup by removing groups and languages
 * that are no longer actively being synced. Only trims entries matching the
 * specified type and optional subType.
 *
 * Also honours the optional publishDate range on `options`:
 * - Entries whose range is entirely outside `[publishDateMin, publishDateMax]` are dropped.
 * - Entries partially outside the range are clamped to the intersection.
 *   The latter only applies to Content entries — DeleteCmd entries are always kept open.
 */
export function trim(options: SyncBaseOptions): void {
    const targetChunkType = getChunkTypeString(options.type, options.subType);
    const targetRange = resolveRange(options.publishDateMin, options.publishDateMax);
    const targetRangeIsOpen = targetRange.min === OPEN_MIN && targetRange.max === OPEN_MAX;

    // Process entries in reverse to safely remove items during iteration
    for (let i = syncList.value.length - 1; i >= 0; i--) {
        const entry = syncList.value[i];

        // Only trim entries that match the target chunkType
        if (entry.chunkType !== targetChunkType) {
            continue;
        }

        // Trim memberOf groups - keep only groups that are in the options.memberOf array
        const trimmedGroups = entry.memberOf.filter((group) => options.memberOf.includes(group));

        // If no groups remain after trimming, remove the entire entry
        if (trimmedGroups.length === 0) {
            syncList.value.splice(i, 1);
            continue;
        }

        // Update the entry with trimmed groups
        entry.memberOf = trimmedGroups.sort();

        const { type } = splitChunkTypeString(entry.chunkType);

        // Trim languages for content and deleteCmd document types
        if (
            (type === DocType.Content || type === DocType.DeleteCmd) &&
            entry.languages &&
            options.languages
        ) {
            const trimmedLanguages = entry.languages.filter((lang) =>
                options.languages!.includes(lang),
            );

            // If no languages remain after trimming, remove the entire entry
            if (trimmedLanguages.length === 0) {
                syncList.value.splice(i, 1);
                continue;
            }

            // Update the entry with trimmed languages
            entry.languages = trimmedLanguages.sort();
        }

        // Clamp / drop based on publishDate range. Only applies to Content; DeleteCmd
        // entries must remain open so deletes propagate regardless of the user's cutoff.
        if (type === DocType.Content && !targetRangeIsOpen) {
            const entryRange = resolveRange(entry.publishDateMin, entry.publishDateMax);

            // Drop entries fully outside the target range.
            if (entryRange.max < targetRange.min || entryRange.min > targetRange.max) {
                syncList.value.splice(i, 1);
                continue;
            }

            // Clamp partially overlapping entries to the intersection.
            const clampedMin = Math.max(entryRange.min, targetRange.min);
            const clampedMax = Math.min(entryRange.max, targetRange.max);
            entry.publishDateMin = clampedMin;
            entry.publishDateMax = clampedMax;
        }
    }
}
