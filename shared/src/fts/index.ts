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
export { ftsSearchLocal, ftsSearchManyLocal, trimFtsResults } from "./ftsSearch";
export {
    ftsSearch,
    ftsSearchMany,
    ftsSearchInWorker,
    ftsSearchManyInWorker,
} from "./ftsSearchRouted";
export { ftsSearchApi, shouldUseApiFts } from "./ftsSearchApi";
export { attachFtsLiveSync, markFtsStale } from "./ftsLiveSync";
export { ftsMightMatchQuery } from "./ftsMightMatchQuery";
export type { FtsMightMatchOptions } from "./ftsMightMatchQuery";
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
    setCorpusScanner,
} from "./ftsIndexer";
export { scanCorpus } from "./corpusScan";
export type { CorpusScanResult } from "./corpusScan";
