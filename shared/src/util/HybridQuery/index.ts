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
// Capability contracts plus the pieces needed to compose a query for an
// environment the default browser adapters do not serve.
export type {
    ActivityKind,
    Dispose,
    LocalRead,
    OwnSubscription,
    QueryActivity,
    QueryCapabilities,
    QueryCoverage,
    QueryPagination,
    QueryPlan,
    QuerySources,
    RemoteChanges,
    ResponseCache,
    SessionObserver,
} from "./contracts";
export { QuerySession } from "./querySession";
export { planBrowserQuery } from "./browserPlanner";
export { paginateByLimit } from "./pagination";
export { planCoveredQuery, resolveQueryOnce } from "./renderQuery";
export { STORAGE_PREFIX, omitFields, type CachedWindow } from "./cacheCodec";
export { createResponseCache, type CacheStorage } from "./cacheStorage";
