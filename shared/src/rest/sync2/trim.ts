import { DocType } from "../../types";
import { syncList } from "./state";
import { splitChunkTypeString } from "./utils";

/**
 * Trim unused languages and memberOf groups from existing syncListEntries.
 * This prevents unused group/language buildup by removing groups and languages
 * that are no longer actively being synced. Scans through all types in syncList.
 *
 * @param options - Options specifying which groups and languages should be kept
 * @param options.memberOf - Array of memberOf groups that should be kept
 * @param options.languages - Array of languages that should be kept (for content document types only)
 */
export function trim(options: { memberOf: string[]; languages?: string[] }): void {
    // Process entries in reverse to safely remove items during iteration
    for (let i = syncList.value.length - 1; i >= 0; i--) {
        const entry = syncList.value[i];

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

        // Trim languages for content document types
        if (type === DocType.Content && entry.languages && options.languages) {
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
    }
}
