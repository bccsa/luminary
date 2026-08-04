import { computed, onServerPrefetch, shallowRef, type ComputedRef, type ShallowRef } from "vue";
import {
    useHybridQueryWithState,
    type ContentDto,
    DocType,
    type MangoSelector,
    type MangoQuery,
    type HybridQueryOptions,
    queryRemote,
    structuralCacheKey,
    writeResponseCache,
    isProvablyEmpty,
} from "luminary-shared";
import { useDisplayLanguageIds } from "@/ssg/renderLanguage";
import { hasPersistedSession } from "@/auth";
import { mangoIsPublished, publishedNowConditions } from "@/util/mangoIsPublished";
import { useRoute } from "vue-router";
import { docKey, facetsFromSelector } from "@/ssg/facetKeys";
import { reportCacheEntry, reportKeys } from "@/ssg/dependencyCapture";
import { chainFor, queueOnChain } from "@/ssg/ssrChains";
import { isPrerender } from "@/ssg/isPrerender";
import { queryContentLocal } from "@/ssg/contentStore";

/** Reads back one just-written response-cache entry so it can be attributed to its route. Takes the full `hqcache:`-prefixed storage key (matching shared's `STORAGE_PREFIX`). */
function readCacheEntry(storageKey: string): string | null {
    try {
        return globalThis.localStorage?.getItem(storageKey) ?? null;
    } catch {
        return null;
    }
}

function stripDocs(docs: ContentDto[], stripFields: string[]): ContentDto[] {
    if (!stripFields.length) return docs;
    return docs.map((d) => {
        const copy = { ...d } as Record<string, unknown>;
        for (const f of stripFields) delete copy[f];
        return copy as ContentDto;
    });
}

// Resolve a query from the build-time content corpus when `local` is set and a corpus
// was published; otherwise POST as before. The `local` flag is the caller's promise that
// the query's selector bounds results to `publishDate <= now` (i.e. `publishedFilter` and
// `includeScheduled === false` — the default `includeScheduled` is treated as true by
// `mangoIsPublished`, so only an explicit `false` rules out coming-soon docs). The corpus
// is the anonymous published-now set, so a query that can match future-dated docs must
// still go to `queryRemote`.
function resolveQuery(q: MangoQuery, local: boolean): Promise<ContentDto[]> {
    const localResult = local ? queryContentLocal(q) : null;
    return localResult ? Promise.resolve(localResult) : queryRemote<ContentDto>(q);
}

// Backs `buildOnce`: a query that is genuinely identical on every route (see the option's
// own doc comment for the safety caveat) shares ONE fetch for the whole build instead of
// firing again per page.
const buildOnceFetches = new Map<string, Promise<ContentDto[]>>();

function fetchBuildOnce(key: string, q: MangoQuery, local: boolean): Promise<ContentDto[]> {
    let p = buildOnceFetches.get(key);
    if (!p) {
        p = resolveQuery(q, local).catch((err) => {
            // Don't let one transient failure poison the rest of the build — let the next page's render retry.
            buildOnceFetches.delete(key);
            throw err;
        });
        buildOnceFetches.set(key, p);
    }
    return p;
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
    /**
     * Fields stripped only from the SSR-authored response-cache write, distinct from `cacheStripFields` (which also strips from the client's ongoing re-cache writes). Use this for a field the hydrating client can recover another way (e.g. from the rendered DOM) to avoid shipping it twice.
     */
    ssrCacheStripFields?: string[];
    /**
     * Marks this query as identical across the ENTIRE SSG build (e.g. a fixed-id
     * copyright lookup), so the SSR branch fetches it once for the whole build instead
     * of once per route, and runs it outside the per-route serial chain (a
     * build-constant query has no parent/child ordering to respect).
     *
     * The fetch is memoized by the query's {@link structuralCacheKey}, which collapses
     * runtime VALUES (a `parentId`/`slug` literal) to a shape-only key. Only opt in
     * where the query is genuinely build-constant — applying this to a per-document
     * query would silently serve one document's result to every other route sharing
     * that query's shape. Default `false`.
     */
    buildOnce?: boolean;
};

/** Reactive bundle returned by {@link useContentQueryWithState}. */
export type ContentQueryState = {
    output: ShallowRef<ContentDto[]>;
    /**
     * `true` until the query has genuinely settled (local read and remote supplement). Use this instead of a fixed timeout to tell "still fetching" from "fetched, genuinely empty" — a timeout races any query slower than the guess.
     */
    isFetching: ComputedRef<boolean>;
};

/**
 * Thin wrapper around {@link useHybridQuery} for Content documents. Injects the
 * boilerplate every content feed repeats — a top-level `{ type: Content }` (which
 * HybridQuery routing requires to take the local-first + API-supplement path),
 * the `mangoIsPublished` filter, and the `use_index` hint — and defaults to
 * `live` + `persistOffline`.
 *
 * The web/SSG build needs nothing special at call sites: on the browser this is the
 * SAME local-first hybrid query as the normal SPA, and its `cache: true` first-paint seed is
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
    return useContentQueryState(selector, options).output;
}

/**
 * Like {@link useContentQuery}, but also exposes {@link ContentQueryState.isFetching} —
 * for a caller that must tell "still fetching" from "fetched, genuinely empty" (e.g. a
 * not-found resolver) instead of guessing off a wall-clock timeout. Same query/options
 * contract, same SSR/client routing.
 */
export function useContentQueryWithState(
    selector: () => MangoSelector[],
    options: UseContentQueryOptions = {},
): ContentQueryState {
    return useContentQueryState(selector, options);
}

function useContentQueryState(
    selector: () => MangoSelector[],
    options: UseContentQueryOptions = {},
): ContentQueryState {
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
        ssrCacheStripFields,
        buildOnce = false,
        ...rest
    } = options;

    // Resolved during setup because injection is only available there. During the prerender
    // this is the language of the page being rendered; on the client it reads the shared ref
    // as before.
    const displayLanguageIds = useDisplayLanguageIds();

    const buildQuery = () => ({
        selector: {
            $and: [
                { type: DocType.Content },
                ...selector(),
                ...(publishedFilter
                    ? languageFilter && displayLanguageIds().length === 0
                        ? // No display language resolved: an empty `$in` makes the query
                        // provably empty so the feed stays blank until a language resolves,
                        // instead of the priority clause collapsing to match-any and surfacing
                        // every sibling translation of each parent as separate tiles.
                        [
                            ...publishedNowConditions({ includeScheduled }),
                            { language: { $in: [] } },
                        ]
                        : mangoIsPublished(languageFilter ? displayLanguageIds() : [], {
                              includeScheduled,
                          })
                    : []),
            ] as MangoSelector[],
        },
        ...(sort ? { $sort: sort } : {}),
        ...(limit !== undefined ? { $limit: limit } : {}),
        use_index: useIndex,
    });

    const hybridOptions = {
        live,
        cache,
        persistOffline,
        stripFields,
        ...rest,
        // Auth-scope the response-cache key: the SSG build always seeds the `:anon`
        // entry (see the SSR branch below), so a returning logged-in client must
        // read/write a different `:auth` entry rather than painting the public seed
        // or overwriting it with personalized data (see useContentQuery.spec.ts).
        cacheId: `${rest.cacheId ?? ""}:${hasPersistedSession() ? "auth" : "anon"}`,
    };

    // --- Web/SSG PRERENDER (Node) only. The browser client + the normal SPA both fall through
    // to the identical hybrid query below; on the client `cache: true` seeds the first
    // render synchronously from the response cache this branch primed at build time. ---
    if (isPrerender()) {
        const out = shallowRef<ContentDto[]>([]);
        // Flips false once the prefetch below resolves — content is always fully
        // resolved by render time (vite-ssg awaits onServerPrefetch), so this only
        // matters to a caller that reads it mid-prefetch (none currently do).
        const fetching = shallowRef(true);
        const renderLang = () => displayLanguageIds()[0] || "";
        // Read during setup (not inside the async hook below, which runs after it): vite-ssg
        // pushes the router to the route being prerendered before rendering, so this is the
        // page whose keys and cache seed the work below belongs to.
        const route = useRoute().path;
        onServerPrefetch(async () => {
            const run = async () => {
                const q = buildQuery();
                // Unsatisfiable selector (e.g. an empty `$in`, before a parent query has
                // resolved) — skip the POST entirely and settle to empty, mirroring the
                // client's `HybridQuery._run` short-circuit (isProvablyEmpty).
                if (isProvablyEmpty(q.selector)) {
                    out.value = [];
                    return;
                }
                // `publishedFilter && includeScheduled === false` is the set of queries
                // whose selector bounds results to `publishDate <= now`, so the build-time
                // corpus (the anonymous published-now set) can answer them locally.
                const local = publishedFilter && includeScheduled === false;
                const docs = stripDocs(
                    buildOnce
                        ? await fetchBuildOnce(structuralCacheKey(q, rest.cacheId), q, local)
                        : await resolveQuery(q, local),
                    stripFields,
                );
                out.value = docs;
                // Prime shared's response cache (same key the client computes) so the hydrating
                // client shows these docs on first paint with no flash. vite-ssg serializes
                // these `hqcache:*` entries into the page HTML. Gated on `cache` to match the
                // client branch, which never reads a seed it didn't ask for — an uncached
                // query's SSR write is dead data that only inflates the prerender's peak
                // localStorage footprint (the jsdom quota is bounded, and a page fires several
                // of these mid-render).
                if (cache) {
                    const cacheKey = structuralCacheKey(q, `${rest.cacheId ?? ""}:anon`);
                    writeResponseCache(
                        // Prerendering is always anonymous — see the client branch's
                        // `hybridOptions.cacheId` above for the `:auth` counterpart.
                        cacheKey,
                        { local: docs, remote: [] },
                        limit,
                        // ssrCacheStripFields (SSR-only) falls back to cacheStripFields so a
                        // caller that doesn't need the asymmetry can keep using one option.
                        ssrCacheStripFields ?? rest.cacheStripFields,
                    );
                    // Attribute the entry to this route as it is written. `writeResponseCache`
                    // targets one shared store, so scraping it after the render would also
                    // pick up whatever pages rendering alongside this one put there. Read back
                    // under the same `hqcache:`-prefixed storage key shared writes (and the
                    // client reads) — the prefix is the one shared's `STORAGE_PREFIX` uses, so
                    // the inlined seed lands under the exact key the hydrating client reads.
                    const storageKey = "hqcache:" + cacheKey;
                    const cached = readCacheEntry(storageKey);
                    if (cached !== null) reportCacheEntry(route, storageKey, cached);
                }
                // Dependency-capture attribution is per-ROUTE regardless of whether the
                // fetch itself was shared via `buildOnce` — this route still needs its own
                // rebuild-dependency entry.
                reportKeys(route, [
                    ...facetsFromSelector(q.selector, renderLang()),
                    ...docs.map((d) => docKey(d.parentId || d._id)),
                ]);
            };
            if (buildOnce) {
                // A build-constant query has no parent/child ordering to respect, so it
                // runs outside the per-route chain — this also shortens the chain by one
                // hop for every route that uses one.
                await run();
            } else {
                const queued = chainFor(route).then(run);
                queueOnChain(route, queued);
                await queued;
            }
            fetching.value = false;
        });
        return { output: out, isFetching: computed(() => fetching.value) };
    }

    const { output, isFetching } = useHybridQueryWithState<ContentDto>(buildQuery, hybridOptions);
    return { output, isFetching };
}
