import { onServerPrefetch, shallowRef, watch } from "vue";
import {
    useHybridQuery,
    type ContentDto,
    DocType,
    type MangoSelector,
    type HybridQueryOptions,
} from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { mangoIsPublished } from "@/util/mangoIsPublished";
import { usePublicContentStore } from "@/stores/publicContent";
import { queryPublic } from "@/ssg/queryPublic";
import { sliceKey } from "@/ssg/sliceKey";
import { docKey, facetsFromSelector } from "@/ssg/facetKeys";
import { reportKeys } from "@/ssg/dependencyCapture";

const IS_WEB = import.meta.env.VITE_BUILD_TARGET === "web";

// Serializes the SSG prefetch fetches in registration order so chained queries
// (e.g. HomePagePinned: pinnedCategories → pinnedCategoryContent reads its result)
// resolve correctly under vite-ssg's concurrent onServerPrefetch. The parent query
// is declared before the child, so its fetch (and ref population) completes first.
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

    const buildQuery = () => ({
        selector: {
            $and: [
                { type: DocType.Content },
                ...selector(),
                ...(publishedFilter
                    ? mangoIsPublished(languageFilter ? appLanguageIdsAsRef.value : [], {
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

    // --- Native / SPA build: unchanged local-first hybrid query. ---
    if (!IS_WEB) {
        return useHybridQuery<ContentDto>(buildQuery, hybridOptions);
    }

    // --- Web / SSG build: prerender via the public API, capture dependency keys,
    // snapshot for clean hydration. (See app/src/ssg/README.md.) ---
    const store = usePublicContentStore();
    // renderLang: the language THIS page is prerendered in (set per route at build,
    // serialized, restored on the client) — drives the slice key + facet scoping so
    // build and client agree.
    const renderLang = () => store.renderLang || appLanguageIdsAsRef.value[0] || "";
    const keyFor = () => sliceKey(selector(), { sort, limit, useIndex }, renderLang());

    if (import.meta.env.SSR) {
        const out = shallowRef<ContentDto[]>([]);
        onServerPrefetch(async () => {
            await (ssrChain = ssrChain.then(async () => {
                const q = buildQuery();
                const docs = await queryPublic<ContentDto>({
                    selector: q.selector,
                    sort: q.$sort,
                    limit: q.$limit,
                    use_index: q.use_index,
                });
                const stripped = stripDocs(docs, stripFields);
                store.setSlice(keyFor(), stripped);
                out.value = stripped;
                reportKeys([
                    ...facetsFromSelector(q.selector, renderLang()),
                    ...stripped.map((d) => docKey(d.parentId || d._id)),
                ]);
            }));
        });
        return out;
    }

    // Client: seed the first render from the prerendered slice (hydration match),
    // then hand off to the live hybrid query (post-flush, after hydration).
    const out = shallowRef<ContentDto[]>(store.getSlice(keyFor()) ?? []);
    const liveResult = useHybridQuery<ContentDto>(buildQuery, hybridOptions);
    watch(
        liveResult,
        (v) => {
            out.value = v;
        },
        { flush: "post" },
    );
    return out;
}
