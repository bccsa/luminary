import { DocType, type BaseDocumentDto } from "../types";
import { syncList } from "../api/sync/state";
import { splitChunkTypeString } from "../api/sync/utils";
import type { SyncListEntry } from "../api/sync/types";
import { mangoCompile } from "../util/MangoQuery/mangoCompile";
import type { MangoSelector, Predicate } from "../util/MangoQuery/MangoTypes";

/**
 * "May this document from the **live socket firehose** be persisted to IndexedDB?" — narrows the
 * access-scoped Socket.io `data` feed (every doc the user *can* see) to what this client actually
 * **syncs**. Derived from **sync's `syncList`** (the sync engine's live source of truth). Used by
 * the sync live persister (`api/sync/liveSync.ts`).
 *
 * NOT used by HybridQuery's `persistOffline`: that path persists content the consumer *explicitly
 * fetched for display* (already permission-scoped by the API), gated only by `type === Content` —
 * because `isSyncableDoc` requires a populated `syncList` content entry, which sync creates only
 * after fetching a content doc, so a below-cutoff-only corpus (sync fetches nothing) would persist
 * nothing. The two paths have genuinely different floors (unrequested firehose vs. fetched-and-shown).
 *
 * A doc is syncable iff it is a `DeleteCmd` (always applied so deletions
 * propagate), or it matches the **subscription selector** of at least one
 * `syncList` entry. The subscription selector is the sync query stripped of its
 * fetch-progress bounds (`updatedTimeUtc`) and `publishDate` window — i.e. the
 * identity of what the entry subscribes to: `{ type }`, plus for Content the
 * `parentType` (the chunk's subType) and, when the entry pins languages, a
 * **language-priority keep**: in a pinned language, OR (when none of the pinned
 * languages has a published translation) the post's fallback translation. This
 * lets a non-synced fallback translation be persisted on receipt without syncing
 * every language — mirroring the consumer's display-side language priority.
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
        const base = { type: DocType.Content, parentType: subType };
        const langs = entry.languages ?? [];
        // No pinned languages → keep any content of this parentType (full-language sync, e.g. CMS).
        if (!langs.length) return base as MangoSelector;
        // Priority-keep: keep a content doc iff it is in a synced language, OR none of the synced
        // languages has a published translation of this post (so it is the user's fallback). The
        // socket distributes all languages; this filters on receipt so a non-synced "fallback"
        // translation is still persisted, mirroring the app's display language-priority selection
        // WITHOUT syncing every language. Set-based (order is irrelevant for the keep decision).
        return {
            $and: [
                base,
                {
                    $or: [
                        { language: { $in: langs } },
                        {
                            $and: langs.map((l) => ({
                                $not: { availableTranslations: { $elemMatch: { $eq: l } } },
                            })),
                        },
                    ],
                },
            ],
        } as MangoSelector;
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
