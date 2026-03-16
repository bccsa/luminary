export type {
    FtsFieldConfig,
    FtsSearchOptions,
    FtsSearchResult,
    FtsCorpusStats,
} from "./types";
export {
    stripHtml,
    normalizeText,
    generateTrigrams,
    generateTrigramCounts,
    generateSearchTrigrams,
} from "./trigram";
export { ftsSearch } from "./ftsSearch";
export { useFtsSearch } from "./useFtsSearch";
export type { UseFtsSearchOptions, UseFtsSearchReturn } from "./useFtsSearch";
export {
    getCorpusStats,
    setCorpusStats,
    recomputeCorpusStats,
    scheduleCorpusStatsRecompute,
} from "./ftsIndexer";
