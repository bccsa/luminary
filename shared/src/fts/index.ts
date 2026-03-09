export type {
    FtsFieldConfig,
    FtsConfig,
    FtsSearchOptions,
    FtsSearchResult,
    FtsIndexEntry,
    FtsMetaEntry,
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
export type { UseFtsSearchOptions } from "./useFtsSearch";
export { initFts, ftsNotifyUpdated, ftsNotifyDeleted, destroyFts, ftsIndexing } from "./ftsManager";
export {
    indexDocument,
    removeDocumentFromIndex,
    removeDocumentsFromIndex,
    indexBatch,
    getCheckpoint,
    setCheckpoint,
    getCorpusStats,
    setCorpusStats,
    checkAndResetIfConfigChanged,
} from "./ftsIndexer";
