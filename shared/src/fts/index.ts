export type {
    FtsFieldConfig,
    FtsSearchOptions,
    FtsSearchResult,
    FtsCorpusStats,
    ApiFtsResult,
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
export type { UseFtsSearchOptions, UseFtsSearchReturn } from "./useFtsSearch";
export {
    getCorpusStats,
    setCorpusStats,
    recomputeCorpusStats,
    scheduleCorpusStatsRecompute,
} from "./ftsIndexer";
