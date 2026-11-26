import { DocType } from "../../types";
import { contentLanguageKeepSelector } from "./keepSelector";
import type { SyncOptions } from "./types";
import { OPEN_MAX, OPEN_MIN } from "./utils";

/** Build the same permission-scoped sync selector for legacy and stable pagination. */
export function buildSyncQuery(
    options: SyncOptions,
    chunk: { blockStart: number; blockEnd: number },
) {
    const firstSync = chunk.blockEnd === 0;
    const mangoQuery: any = {
        selector: {
            type: options.type,
            updatedTimeUtc: { $lte: chunk.blockStart, $gte: chunk.blockEnd }, // We are overlapping chunks by 1 entry to be able to merge chunks properly
        },
        limit: options.limit,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index:
            options.type === DocType.Content && options.alwaysOffline
                ? "sync-content-alwaysOffline-index"
                : options.type === DocType.Content
                  ? "sync-content-index"
                  : "sync-" +
                    (options.subType ? options.subType + "-" : "") +
                    options.type +
                    "-index",
        cms: options.cms,
        identifier: "sync", // Identifier for the API query validation template
    };

    if (options.source) {
        mangoQuery.dataSource = options.source.name;
    } else {
        mangoQuery.selector.memberOf = {
            $elemMatch: { $in: options.memberOf },
        };
    }

    if (options.type === DocType.Content && !options.cms && !firstSync) {
        mangoQuery.includeExpired = true;
    }

    // Add parentType and language selectors to content queries
    if (options.type === DocType.Content && options.subType) {
        mangoQuery.selector.parentType = options.subType;
        const langs = options.languages || [];
        if (options.cms) {
            // CMS syncs all available languages: a flat membership returns all content, and the
            // set-based keep's fallback branch would be vacuous while bloating the selector with
            // one negation per language. So CMS keeps the simple flat filter.
            mangoQuery.selector.language = { $in: langs };
        } else if (langs.length) {
            // App: set-based priority-fallback keep (shared with the live gate via
            // contentLanguageKeepSelector) — a synced language OR the last-resort fallback
            // translation. Downloads exactly the set the local read can later pick the best
            // translation from, offline, with no per-feed API supplement. ANDed with the existing
            // top-level equality keys (CouchDB implicit-ANDs top-level fields with the injected $or).
            Object.assign(mangoQuery.selector, contentLanguageKeepSelector(langs));
        } else {
            // Empty language set → match nothing (don't let an absent set fetch the whole corpus).
            mangoQuery.selector.language = { $in: [] };
        }
        if (options.alwaysOffline) {
            mangoQuery.selector.parentAlwaysOffline = true;
        }
    }

    // Add docType selector for deleteCmd queries. DeleteCmds are language-UNSCOPED: a delete of any
    // downloaded doc — including a non-synced fallback translation, whose DeleteCmd carries that
    // (non-synced) language — must propagate, or the doc would linger in IndexedDB forever. DeleteCmds
    // are tiny, so fetching every language's content DeleteCmds is cheap.
    if (options.type === DocType.DeleteCmd && options.subType) {
        mangoQuery.selector.docType = options.subType;
    }

    // Inject publishDate range selector for Content queries when the range is narrowed.
    // DeleteCmd queries are intentionally never publishDate-filtered so deletes propagate
    // regardless of the user's cutoff. When both bounds are at defaults the selector is
    // omitted so the wire format stays byte-identical to clients that don't use publishDate.
    if (options.type === DocType.Content && !options.alwaysOffline) {
        const pdMin = options.publishDateMin ?? OPEN_MIN;
        const pdMax = options.publishDateMax ?? OPEN_MAX;
        const isNarrowed = pdMin > OPEN_MIN || pdMax < OPEN_MAX;
        if (isNarrowed) {
            const pd: { $gte?: number; $lte?: number } = {};
            if (pdMin > OPEN_MIN) pd.$gte = pdMin;
            if (pdMax < OPEN_MAX) pd.$lte = pdMax;
            mangoQuery.selector.publishDate = pd;
        }
    }

    return mangoQuery;
}
