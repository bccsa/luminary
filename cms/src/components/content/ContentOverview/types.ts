import { DocType, type TagType, type PostType, type Uuid } from "luminary-shared";

/**
 * Shape of the ContentOverview filter/sort state. Driven by the FilterOptions UI,
 * persisted to sessionStorage, and consumed by the browse/search composables.
 *
 * (Moved here from the old `content/query.ts` when the in-memory `contentOverviewQuery`
 * was replaced by HybridQuery browse + FTS search. Pagination fields (`pageIndex`/
 * `count`) were dropped — the overview now uses infinite scroll.)
 */
export type ContentOverviewQueryOptions = {
    languageId: Uuid;
    parentType: DocType.Post | DocType.Tag;
    tagOrPostType: TagType | PostType;
    orderBy?: "title" | "updatedTimeUtc" | "publishDate" | "expiryDate";
    orderDirection?: "asc" | "desc";
    translationStatus?: "translated" | "untranslated" | "all";
    publishStatus?: "published" | "scheduled" | "expired" | "draft" | "all";
    tags?: Uuid[];
    groups?: Uuid[];
    search?: string;
};
