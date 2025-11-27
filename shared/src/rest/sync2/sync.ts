import { DocType } from "../../types";
import { db } from "../../db/database";
import { HttpReq } from "../http";
import { syncBatch } from "./syncBatch";
import type { SyncRunnerOptions } from "./types";
import { getGroups, getGroupSets, getLanguages } from "./utils";
import { trim } from "./trim";

let _httpService: HttpReq<any>;

/**
 * Cancellation flag that can be set by the implementing application.
 * When true, all running sync operations will stop at the next check point.
 * The implementing application is responsible for managing this flag:
 * - Set to `true` to cancel sync (e.g., when going offline)
 * - Set to `false` to allow sync to run (e.g., when coming back online)
 */
export let cancelSync = false;

/**
 * Initialize sync module with HTTP service
 */
export async function initSync(httpService: HttpReq<any>) {
    _httpService = httpService;
    await db.getSyncList();
}

/**
 * Set the cancellation flag to stop all running sync operations.
 * @param value - true to cancel / block sync, false to allow sync
 *
 * @example
 * ```typescript
 * import { setCancelSync } from "./sync2";
 *
 * // Cancel sync when going offline
 * setCancelSync(true);
 *
 * // Allow sync when coming back online
 * setCancelSync(false);
 * ```
 */
export function setCancelSync(value: boolean): void {
    cancelSync = value;
}

/**
 * Autonomous sync runner per document type / type:parentType (content documents). The runner splits itself into multiple runners
 * if new memberOf groups or languages are detected, and combines syncList entries with adjacent entries - vertically by
 * updatedTimeUtc (aka blockStart & blockEnd), and horizontally by memberOf groups and languages.
 * The synchronization runs backwards in time from the latest updatedTimeUtc to older data.
 */
export async function sync(options: SyncRunnerOptions): Promise<void> {
    if (!_httpService) throw new Error("Sync module not initialized with HTTP service");

    // Trim syncList before starting sync
    trim(options);
    await _sync(options);
}

/**
 * Autonomous sync runner per document type / type:parentType (content documents). The runner splits itself into multiple runners
 * if new memberOf groups or languages are detected, and combines syncList entries with adjacent entries - vertically by
 * updatedTimeUtc (aka blockStart & blockEnd), and horizontally by memberOf groups and languages.
 * The synchronization runs backwards in time from the latest updatedTimeUtc to older data.
 */
export async function _sync(options: SyncRunnerOptions): Promise<void> {
    // Check if sync has been cancelled before starting
    if (cancelSync) {
        return;
    }

    console.log("Starting sync for", options.type);

    const [docType, parentType] = options.type.split(":");

    // Compare passed languages with existing languages in the syncList for the given type and memberOf
    if (docType === DocType.Content) {
        // Get list of languages already present in the syncList for the given type and list of languages
        const existingLanguages = getLanguages().filter((lang) =>
            options.languages?.includes(lang),
        );

        const newLanguages =
            options.languages?.filter((lang) => !existingLanguages.includes(lang)) || [];

        // Start separate sync for new languages if there are existing languages to sync
        // This ensures that new languages are synced before syncing existing languages
        // (usually a new language will be added by the user after having completed a full sync in the existing languages)
        if (newLanguages.length > 0 && existingLanguages.length > 0) {
            await _sync({ ...options, languages: newLanguages });
            options.languages = existingLanguages;
        }

        if (!options.languages?.length) return;
    }

    // Compare passed memberOf groups with existing groups in the syncList for the given type
    const existingGroups = getGroups({ type: options.type });
    const newGroups = options.memberOf.filter((g) => !existingGroups.includes(g));

    // Get the unique memberOf group sets from the syncList for the given type. This is used
    // to continue syncing partial group sets that has not yet been merged (e.g. if a new group
    // was added and the sync was interrupted before merging could occur)
    const groupSets = getGroupSets({ type: options.type });

    if (groupSets.length > 1 || newGroups.length > 0) {
        // Start new runners for any existing group sets
        for (const groupSet of groupSets) {
            await _sync({ ...options, memberOf: groupSet });
        }

        // Use this runner for new groups only
        if (newGroups.length > 0) {
            options.memberOf = newGroups;
        } else {
            // No new groups, this runner is not needed
            return;
        }
    }

    // Start the iterative sync process
    await syncBatch({
        ...options,
        docType,
        parentType,
        initialSync: true,
        httpService: _httpService,
    });
}
