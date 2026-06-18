import {
    useHybridQuery,
    type ContentDto,
    DocType,
    type MangoSelector,
    type HybridQueryOptions,
} from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { mangoIsPublished } from "@/util/mangoIsPublished";

/**
 * Options for {@link useContentQuery}. Extends {@link HybridQueryOptions}
 * (`live` / `cache` / `persistOffline`) with the content-query conveniences this
 * app repeats at every call site.
 */
export type UseContentQueryOptions = HybridQueryOptions & {
    /** CouchDB-style sort, e.g. `[{ publishDate: "desc" }]`. */
    sort?: Array<Record<string, "asc" | "desc">>;
    /** Result cap. With a limit the hybrid routing fetches only the older-tail shortfall. */
    limit?: number;
    /** Forwarded to {@link mangoIsPublished} — allow scheduled "coming soon" tiles. */
    includeScheduled?: boolean;
    /**
     * Whether to inject the `mangoIsPublished` clauses (status / publishDate /
     * expiry / language priority). Default `true`. Set `false` for lookups that
     * gate publish state themselves (e.g. SingleContent by slug / translations).
     */
    publishedFilter?: boolean;
    /**
     * Whether to inject the language-*priority* clause from {@link mangoIsPublished}
     * (pick the user's preferred translation, exclude the others). Default `true`. Set
     * `false` for a unique-slug lookup that must return the exact doc regardless of
     * language preference (e.g. SingleContent by slug) — `status` / `publishDate` /
     * `expiry` are still applied.
     */
    languageFilter?: boolean;
    /**
     * CouchDB index hint forwarded to the API. Defaults to the shared
     * `content-publishDate-index` (already allowlisted server-side). Override only
     * for a query that has its own dedicated design-doc index.
     */
    useIndex?: string;
};

/**
 * Thin wrapper around {@link useHybridQuery} for Content documents. Injects the
 * boilerplate every content feed repeats — a top-level `{ type: Content }` (which
 * HybridQuery routing requires to take the local-first + API-supplement path),
 * the `mangoIsPublished` filter, and the `use_index` hint — and defaults to
 * `live` + `persistOffline`.
 *
 * `cache` (the response-cache first-paint seed) defaults to **`false`**. The cache
 * key is the query *shape* (runtime values like `parentId`/`slug` are stripped), so a
 * per-document lookup would seed itself from a different document's last result. Only
 * enable `cache: true` on a stable *overview feed* where every mount is genuinely the
 * same query (home / explore / watch tiles) — never on a per-document query, where the
 * stale seed is a correctness bug, not a cosmetic flash (see SingleContent). When two
 * cached feeds share a shape (so they'd collide on one entry), pass a distinct
 * `cacheId` per call site to separate their fingerprints (see ContinueWatching /
 * ContinueListening).
 *
 * Pass the caller-specific selector clauses as a thunk so any `ref` they read
 * (language ids, a sibling query's result, …) is auto-tracked and rebuilds the
 * query reactively.
 *
 * @example
 * const pinned = useContentQuery(() => [{ parentPinned: 1 }], { cache: true }); // overview feed
 * const newest = useContentQuery(() => [], { sort: [{ publishDate: "desc" }], limit: 10, cache: true });
 */
export function useContentQuery(
    selector: () => MangoSelector[],
    options: UseContentQueryOptions = {},
) {
    const {
        sort,
        limit,
        includeScheduled,
        publishedFilter = true,
        languageFilter = true,
        useIndex = "content-publishDate-index",
        live = true,
        cache = false,
        persistOffline = true,
        // Strip heavy / never-rendered fields from the live result (heap) — and, as a
        // consequence, from the response cache too. Tiles read none of these off the
        // feed doc: the search engine reads `fts`/`ftsTokenCount` from Dexie,
        // `memberOf`/`_rev` are never read off a content result, and `text` is the full
        // body only the article view needs. Offline persistence keeps the full docs
        // (the strip runs after the IndexedDB write). Override per call site for a feed
        // that DOES render one of these — e.g. the article body (`text`) or the
        // edit-permission check (`memberOf`).
        stripFields = ["fts", "ftsTokenCount", "text", "memberOf", "_rev"],
        ...rest
    } = options;

    return useHybridQuery<ContentDto>(
        () => ({
            selector: {
                $and: [
                    { type: DocType.Content },
                    ...selector(),
                    ...(publishedFilter
                        ? mangoIsPublished(languageFilter ? appLanguageIdsAsRef.value : [], {
                              includeScheduled,
                          })
                        : []),
                ],
            },
            ...(sort ? { $sort: sort } : {}),
            ...(limit !== undefined ? { $limit: limit } : {}),
            use_index: useIndex,
        }),
        { live, cache, persistOffline, stripFields, ...rest },
    );
}
