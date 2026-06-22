export type {
    FtsFieldConfig,
    FtsSearchOptions,
    FtsSearchResult,
    FtsCorpusStats,
    ApiFtsResult,
    FtsSort,
    FtsSortField,
} from "./types";
export {
    stripHtml,
    normalizeText,
    generateTrigrams,
    generateTrigramCounts,
    generateSearchTrigrams,
} from "./trigram";
export { ftsSearch } from "./ftsSearch";
export { ftsSearchApi, shouldUseApiFts } from "./ftsSearchApi";
export { useFtsSearch } from "./useFtsSearch";
export type { UseFtsSearchOptions, UseFtsSearchReturn, FtsFilterOptions } from "./useFtsSearch";
export { useServerFtsSearch } from "./useServerFtsSearch";
export type {
    UseServerFtsSearchOptions,
    UseServerFtsSearchReturn,
    ServerFtsSort,
    ServerFtsFilters,
} from "./useServerFtsSearch";
export {
    getCorpusStats,
    setCorpusStats,
    recomputeCorpusStats,
    scheduleCorpusStatsRecompute,
} from "./ftsIndexer";
