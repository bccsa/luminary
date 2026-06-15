import { DocType, type BaseDocumentDto } from "../types";
import { syncList } from "../api/sync/state";
import { splitChunkTypeString } from "../api/sync/utils";
import type { SyncListEntry } from "../api/sync/types";
import { mangoCompile } from "../util/MangoQuery/mangoCompile";
import type { MangoSelector, Predicate } from "../util/MangoQuery/MangoTypes";

/**
 * The single, authoritative "may this document be persisted to IndexedDB?" gate.
 * Derived from **sync's `syncList`** (the live source of truth for what this
 * client syncs) — NOT the static `config.syncList`. Used by the sync live
 * persister (`api/sync/liveSync.ts`) and by HybridQuery's offline-persistence
 * path so neither can drift from the other.
 *
 * A doc is syncable iff it is a `DeleteCmd` (always applied so deletions
 * propagate), or it matches the **subscription selector** of at least one
 * `syncList` entry. The subscription selector is the sync query stripped of its
 * fetch-progress bounds (`updatedTimeUtc`) and `publishDate` window — i.e. the
 * identity of what the entry subscribes to: `{ type }`, plus for Content the
 * `parentType` (the chunk's subType) and, when the entry pins languages,
 * `language: { $in: … }`.
 *
 * `memberOf` and `publishDate` are intentionally NOT part of the gate: the
 * server already scopes the feed by room (group) membership, and below-cutoff
 * Content is handled by a separate retention gate in the live persister so
 * `persistOffline` can still cache older docs. Compiled predicates are memoized
 * and rebuilt only when the subscription signature (chunkType + languages)
 * changes — block/publishDate/memberOf churn does not trigger a recompile.
 */

let _signature = "";
let _predicates: Predicate[] = [];

/**
 * Build the subscription selector for one entry, or `undefined` for entries the
 * `DeleteCmd` short-circuit already covers.
 */
function buildSelector(entry: SyncListEntry): MangoSelector | undefined {
    const { type, subType } = splitChunkTypeString(entry.chunkType);
    if (type === DocType.DeleteCmd) return undefined; // handled by the DeleteCmd short-circuit
    if (type === DocType.Content) {
        const sel: Record<string, unknown> = { type: DocType.Content, parentType: subType };
        if (entry.languages?.length) sel.language = { $in: entry.languages };
        return sel as MangoSelector;
    }
    return { type } as MangoSelector;
}

/** Cheap fingerprint of the dimensions the gate depends on (chunkType + languages). */
function signature(entries: readonly SyncListEntry[]): string {
    return entries
        .map((e) => e.chunkType + "|" + (e.languages?.length ? [...e.languages].sort().join(",") : ""))
        .join(";");
}

/** Compiled subscription predicates for the current `syncList`, rebuilt on change. */
function predicates(): Predicate[] {
    const entries = syncList.value;
    const sig = signature(entries);
    if (sig !== _signature) {
        _signature = sig;
        _predicates = entries
            .map(buildSelector)
            .filter((s): s is MangoSelector => s !== undefined)
            .map((s) => mangoCompile(s));
    }
    return _predicates;
}

export function isSyncableDoc(doc: BaseDocumentDto): boolean {
    if (doc.type === DocType.DeleteCmd) return true;
    for (const matches of predicates()) {
        if (matches(doc)) return true;
    }
    return false;
}
