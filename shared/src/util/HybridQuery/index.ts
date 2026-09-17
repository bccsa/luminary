export {
    DEFAULT_REMOTE_QUERY_LIMIT,
    HybridQuery,
    type HybridQueryOptions,
    initHybridQuery,
    queryLocal,
    queryRemote,
} from "./HybridQuery";
export {
    useHybridQuery,
    useHybridQueryWithState,
    type UseHybridQueryState,
} from "./useHybridQuery";
export {
    useSharedHybridQuery,
    useSharedHybridQueryWithState,
    sharedHybridQueryCount,
} from "./sharedHybridQuery";
export { readResponseCache, structuralCacheKey, writeResponseCache } from "./responseCache";

// --- Composition API -------------------------------------------------------
// The capability contract plus the pieces needed to compose a query for an
// environment the default browser adapters do not serve. `QuerySession` and
// `planBrowserQuery` stay internal — no consumer builds its own session or
// reuses the browser's local-first planning rule outside this module.
export type { QueryCapabilities } from "./contracts";
export { paginateByLimit } from "./pagination";
export { planCoveredQuery, resolveQueryOnce } from "./renderQuery";
export { STORAGE_PREFIX, omitFields, type CachedWindow } from "./cacheCodec";
export { createResponseCache, type CacheStorage } from "./cacheStorage";
