import { onServerPrefetch, shallowRef, type ShallowRef } from "vue";
import {
    useHybridQuery,
    type ContentDto,
    DocType,
    type MangoSelector,
    type HybridQueryOptions,
    queryRemote,
    structuralCacheKey,
    writeResponseCache,
} from "luminary-shared";
import { appDisplayLanguageIdsAsRef } from "@/globalConfig";
import { mangoIsPublished } from "@/util/mangoIsPublished";
import { docKey, facetsFromSelector } from "@/ssg/facetKeys";
import { reportKeys } from "@/ssg/dependencyCapture";

// Serializes the SSG prefetch fetches in registration order so chained queries
// (e.g. HomePagePinned: pinnedCategories → pinnedCategoryContent reads its result)
// resolve correctly — vite-ssg awaits a page's onServerPrefetch hooks concurrently,
// so without this the child would build its selector from the still-empty parent ref.
let ssrChain: Promise<unknown> = Promise.resolve();

function stripDocs(docs: ContentDto[], stripFields: string[]): ContentDto[] {
    if (!stripFields.length) return docs;
    return docs.map((d) => {
        const copy = { ...d } as Record<string, unknown>;
        for (const f of stripFields) delete copy[f];
        return copy as ContentDto;
    });
}

/**
 * Options for {@link useContentQuery}. Extends {@link HybridQueryOptions}
 * (`live` / `cache` / `persistOffline` / `cacheId` / `cacheStripFields`) with the
 * content-query conveniences this app repeats at every call site.
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
 * The web/SSG build needs nothing special at call sites: on the browser this is the
 * SAME local-first hybrid query as native, and its `cache: true` first-paint seed is
 * primed by the build (the prerender writes the same response cache via
 * {@link writeResponseCache}, so the first client render shows the prerendered docs
 * with no flash). During the Node prerender the query is fetched once via the shared
 * `queryRemote` (anonymous → public tier) in `onServerPrefetch` so the docs are
 * present at render time, and dependency keys are captured for incremental rebuilds.
 *
 * `cache` (the response-cache first-paint seed) defaults to **`false`**. The cache
 * key is the query *shape* (runtime values like `parentId`/`slug` are stripped), so a
 * per-document lookup would seed itself from a different document's last result. Only
 * enable `cache: true` on a stable *overview feed* where every mount is genuinely the
 * same query (home / explore / watch tiles) — never on a per-document query, where the
 * stale seed is a correctness bug, not a cosmetic flash (see SingleContent, which
 * passes a per-slug `cacheId`). When two cached feeds share a shape (so they'd collide
 * on one entry), pass a distinct `cacheId` per call site to separate their fingerprints
 * (see ContinueWatching / ContinueListening).
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
): ShallowRef<ContentDto[]> {
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

    const buildQuery = () => ({
        selector: {
            $and: [
                { type: DocType.Content },
                ...selector(),
                ...(publishedFilter
                    ? mangoIsPublished(languageFilter ? appDisplayLanguageIdsAsRef.value : [], {
                          includeScheduled,
                      })
                    : []),
            ] as MangoSelector[],
        },
        ...(sort ? { $sort: sort } : {}),
        ...(limit !== undefined ? { $limit: limit } : {}),
        use_index: useIndex,
    });

    const hybridOptions = { live, cache, persistOffline, stripFields, ...rest };

    // --- Web/SSG PRERENDER (Node) only. The browser client + native both fall through
    // to the identical hybrid query below; on the client `cache: true` seeds the first
    // render synchronously from the response cache this branch primed at build time. ---
    if (import.meta.env.SSR) {
        const out = shallowRef<ContentDto[]>([]);
        const renderLang = () => appDisplayLanguageIdsAsRef.value[0] || "";
        onServerPrefetch(async () => {
            await (ssrChain = ssrChain.then(async () => {
                const q = buildQuery();
                const docs = stripDocs(await queryRemote<ContentDto>(q), stripFields);
                out.value = docs;
                // Prime shared's response cache (same key the client computes) so the
                // hydrating client shows these docs on first paint — no flash, no
                // bespoke snapshot store. vite-ssg serializes these `hqcache:*` entries
                // into the page HTML (see vite.config.web.ts).
                writeResponseCache(
                    structuralCacheKey(q, rest.cacheId),
                    { local: docs, remote: [] },
                    limit,
                    rest.cacheStripFields,
                );
                reportKeys([
                    ...facetsFromSelector(q.selector, renderLang()),
                    ...docs.map((d) => docKey(d.parentId || d._id)),
                ]);
            }));
        });
        return out;
    }

    return useHybridQuery<ContentDto>(buildQuery, hybridOptions);
}
