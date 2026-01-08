import { DocType } from "../../types";
import { db } from "../../db/database";
import { HttpReq } from "../http";
import { syncBatch } from "./syncBatch";
import type { SyncRunnerOptions } from "./types";
import {
    getChunkTypeString,
    getGroups,
    getGroupSets,
    getLanguages,
    getLanguageSets,
} from "./utils";
import { trim } from "./trim";
import { syncList } from "./state";

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
 * Autonomous sync runner per document type and optional subType. The runner splits itself into multiple runners
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

export async function _sync(options: SyncRunnerOptions): Promise<void> {
    // Check if sync has been cancelled before starting
    if (cancelSync) return;

    if (options.type === DocType.DeleteCmd)
        throw new Error(
            "Sync: Invalid type selection. Delete commands are included in other syncs.",
        );

    // Default includeDeleteCmds to true if not specified
    options.includeDeleteCmds = options.includeDeleteCmds ?? true;

    // Compare passed languages with existing languages in the syncList for the given type and memberOf
    if (options.type === DocType.Content && options.languages) {
        // Get list of languages already present in the syncList for the given type and list of languages
        const existingLanguages = getLanguages();

        const newLanguages =
            options.languages.filter((lang) => !existingLanguages.includes(lang)) || [];

        // Get the unique languages sets from the syncList for the passed language list. This is used to continue syncing
        // partial language sets that has not yet been merged (e.g. if a new language was added and the sync was
        // interrupted before merging could occur)
        const languageSets = getLanguageSets(options);

        if (languageSets.length > 1 || newLanguages.length > 0) {
            // Start new runners for any existing language sets
            for (const languageSet of languageSets) {
                await _sync({ ...options, languages: languageSet });
            }

            // Use this runner for new languages only
            if (newLanguages.length > 0) {
                options.languages = newLanguages;
            } else {
                // No new languages, this runner is not needed
                return;
            }
        }
    }

    // Compare passed memberOf groups with existing groups in the syncList for the given type
    const existingGroups = getGroups(options);
    const newGroups = options.memberOf.filter((g) => !existingGroups.includes(g));

    // Get the unique memberOf group sets from the syncList for the given type. This is used
    // to continue syncing partial group sets that has not yet been merged (e.g. if a new group
    // was added and the sync was interrupted before merging could occur)
    const groupSets = getGroupSets(options);

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
    const syncResult = await syncBatch({
        ...options,
        initialSync: true,
        httpService: _httpService,
    });

    if (options.includeDeleteCmds && syncResult) {
        const subType = options.type === DocType.Content ? options.subType : options.type;
        const deleteCmdChunkType = getChunkTypeString(DocType.DeleteCmd, subType);

        // We need to detect if a DeleteCmd sync chunk for this exact memberOf group combination
        // already exists in the syncList. If so, we avoid creating a duplicate progress entry.
        // This ensures correct incremental syncing and prevents reprocessing from the start.
        const hasExistingDeleteCmdEntries = syncList.value.some(
            (entry) =>
                entry.chunkType === deleteCmdChunkType &&
                entry.memberOf.length === options.memberOf.length &&
                entry.memberOf.every((g) => options.memberOf.includes(g)),
        );

        if (!syncResult.firstSync) {
            // For subsequent syncs, we need to fetch deleteCmds to catch any deletions since last sync.
            // If there are no existing deleteCmd entries, push a marker entry first so calcChunk
            // doesn't sync from the beginning of time.
            if (!hasExistingDeleteCmdEntries) {
                syncList.value.push({
                    chunkType: deleteCmdChunkType,
                    memberOf: options.memberOf,
                    languages: options.languages,
                    blockStart: syncResult.blockStart,
                    blockEnd: syncResult.blockEnd,
                    eof: syncResult.eof,
                });
            }

            await syncBatch({
                ...options,
                type: DocType.DeleteCmd,
                subType,
                initialSync: true,
                httpService: _httpService,
            });
        } else {
            // For first syncs, the content sync already excludes deleted docs.
            // Just push an entry to track progress for future syncs.
            syncList.value.push({
                chunkType: deleteCmdChunkType,
                memberOf: options.memberOf,
                languages: options.languages,
                blockStart: syncResult.blockStart,
                blockEnd: syncResult.blockEnd,
                eof: syncResult.eof,
            });
        }
    }
}
