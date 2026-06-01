import { DocType } from "../../types";
import { db } from "../../db/database";
import { HttpReq } from "../http";
import { syncBatch } from "./syncBatch";
import type { SyncListEntry, SyncRunnerOptions } from "./types";
import {
    arraysEqual,
    filterByTypeMemberOf,
    getChunkTypeString,
    getGroups,
    getGroupSets,
    getLanguages,
    getLanguageSets,
    splitChunkTypeString,
} from "./utils";
import { trim } from "./trim";
import { syncList, syncTolerance } from "./state";
import { merge } from "./merge";

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
 * Find chunkTypes whose syncList contains a genuinely-degenerate state that the runtime engine
 * cannot resolve on its own — currently: two entries for the same chunkType with identical
 * memberOf + languages (true duplicates that should have vertically merged and never legitimately
 * coexist). The ordinary subset/superset "dual column" is intentionally NOT flagged here: the
 * recursion guard + incomplete-column completion resolve it without discarding state.
 */
function findDegenerateChunkTypes(): Set<string> {
    const byChunkType = new Map<string, SyncListEntry[]>();
    for (const entry of syncList.value) {
        const list = byChunkType.get(entry.chunkType) ?? [];
        list.push(entry);
        byChunkType.set(entry.chunkType, list);
    }

    const degenerate = new Set<string>();
    byChunkType.forEach((entries, chunkType) => {
        for (let i = 0; i < entries.length; i++) {
            for (let j = i + 1; j < entries.length; j++) {
                if (
                    arraysEqual(entries[i].memberOf, entries[j].memberOf) &&
                    arraysEqual(entries[i].languages ?? [], entries[j].languages ?? [])
                ) {
                    degenerate.add(chunkType);
                }
            }
        }
    });
    return degenerate;
}

/**
 * Initialize sync module with HTTP service
 */
export async function initSync(httpService: HttpReq<any>) {
    _httpService = httpService;
    await db.getSyncList();

    // Validate entries — if any are corrupted, discard the entire list
    // so the sync rebuilds from scratch
    const isValid = syncList.value.every(
        (entry) =>
            entry.chunkType &&
            Array.isArray(entry.memberOf) &&
            entry.memberOf.length > 0 &&
            Number.isFinite(entry.blockStart) &&
            Number.isFinite(entry.blockEnd) &&
            entry.blockStart >= 0 &&
            entry.blockEnd >= 0 &&
            entry.blockStart < Number.MAX_SAFE_INTEGER &&
            entry.blockStart >= entry.blockEnd &&
            // Detect merge regression: eof with only syncTolerance coverage
            !(
                entry.eof === true &&
                entry.blockEnd > 0 &&
                entry.blockStart - entry.blockEnd <= syncTolerance
            ),
    );

    if (!isValid) {
        syncList.value = [];
        await db.setSyncList();
        return;
    }

    // Relational self-heal: if a chunkType holds genuinely-degenerate (duplicate) columns, reset
    // just that chunkType (and its paired deleteCmd sibling) so it re-syncs cleanly, rather than
    // discarding the entire list.
    const degenerate = findDegenerateChunkTypes();
    if (degenerate.size) {
        const toReset = new Set(degenerate);
        degenerate.forEach((chunkType) => {
            const { type, subType } = splitChunkTypeString(chunkType);
            if (type !== DocType.DeleteCmd) {
                toReset.add(getChunkTypeString(DocType.DeleteCmd, subType ?? type));
            }
        });
        syncList.value = syncList.value.filter((entry) => !toReset.has(entry.chunkType));
        await db.setSyncList();
    }
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

    const deleteCmdSubType = options.type === DocType.Content ? options.subType : options.type;

    // Trim and merge syncList before starting sync. We are merging before starting the sync to help
    // prevent issues with the syncList not being properly merged due to e.g. disconnection / app closure
    // while syncing.
    trim(options);
    trim({
        ...options,
        type: DocType.DeleteCmd,
        subType: deleteCmdSubType,
    });
    merge(options);
    merge({
        ...options,
        type: DocType.DeleteCmd,
        subType: deleteCmdSubType,
    });
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

    // Whether options.memberOf is itself one of the tracked group sets.
    const selfTracked = groupSets.some((groupSet) => arraysEqual(groupSet, options.memberOf));

    if (groupSets.length > 1 || newGroups.length > 0) {
        // Start new runners for any existing group sets — but NEVER recurse into a set equal to
        // the current options.memberOf. Re-entering _sync with an identical memberOf re-derives the
        // same groupSets and recurses forever (the "dual column" lockout, e.g. a full-set column
        // coexisting with a strict-subset column, which makes getGroupSets return both).
        for (const groupSet of groupSets) {
            if (arraysEqual(groupSet, options.memberOf)) continue;
            await _sync({ ...options, memberOf: groupSet });
        }

        // Use this runner for new groups only
        if (newGroups.length > 0) {
            options.memberOf = newGroups;
        } else if (!selfTracked) {
            // No new groups and the current set is fully covered by the other runners — this
            // runner is not needed
            return;
        }
        // selfTracked && no new groups → fall through to syncBatch for options.memberOf (its own
        // column) instead of returning, so its new content is still caught up in this pass.
    }

    // Start the iterative sync process
    const syncResult = await syncBatch({
        ...options,
        initialSync: true,
        httpService: _httpService,
    });

    if (options.includeDeleteCmds && syncResult) {
        const deleteCmdSubType = options.type === DocType.Content ? options.subType : options.type;

        // Check if there are deleteCmd entries in the syncList for the given type and memberOf groups.
        const hasDeleteCmdEntries = syncList.value.some(
            filterByTypeMemberOf({
                ...options,
                type: DocType.DeleteCmd,
                subType: deleteCmdSubType,
            }),
        );

        if (!hasDeleteCmdEntries) {
            // If this is a new sync column, use the syncBatch result and set as the initial sync state for deleteCmds.
            // This will prevent fetching all deleteCmds from scratch, as the API already would filter out deleted documents when
            // doing an initial sync.
            // To prevent issues due to disconnection / app closure while syncing, we are checking if there are deleteCmd entries
            // on every sync run.
            syncList.value.push({
                chunkType: getChunkTypeString(DocType.DeleteCmd, deleteCmdSubType),
                memberOf: options.memberOf,
                languages: options.languages,
                blockStart: syncResult.blockStart,
                blockEnd: syncResult.blockEnd,
                eof: syncResult.eof,
            });

            merge({ ...options, type: DocType.DeleteCmd, subType: deleteCmdSubType });
        }

        // Start sync process for deleteCmd documents if this is not a new sync "column" (new language or memberOf group)
        if (!syncResult.firstSync) {
            await syncBatch({
                ...options,
                type: DocType.DeleteCmd,
                subType: deleteCmdSubType,
                initialSync: true,
                httpService: _httpService,
            });
        }
    }

    // After an update sync for content documents in APP mode, immediately delete any docs that
    // arrived with an updated (past) expiry date, so they are removed without waiting for app restart.
    if (options.type === DocType.Content && !options.cms && syncResult && !syncResult.firstSync) {
        await db.deleteExpired();
    }
}
