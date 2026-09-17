import {
    useHybridQueryWithState,
    type ContentDto,
    DocType,
    type MangoSelector,
} from "luminary-shared";
import { computed } from "vue";
import type { ContentOverviewQueryOptions } from "./types";
import {
    translationStatusSelector,
    publishStatusSelector,
    dateRangeSelector,
    isUntranslatedRow,
} from "./cmsLanguageSelector";

/** Browse sort fields (excludes "relevance", which is a search-only ordering). */
type BrowseSortField = Exclude<NonNullable<ContentOverviewQueryOptions["orderBy"]>, "relevance">;

/** Sort field → CouchDB index (forwarded to the API supplement; design docs in api/). */
const USE_INDEX: Record<BrowseSortField, string> = {
    publishDate: "content-publishDate-index",
    title: "content-title-index",
    expiryDate: "content-expiryDate-index",
    updatedTimeUtc: "updatedTimeUtc-type-id-index",
};

// Heavy / never-rendered fields stripped from the live result. `memberOf` is KEPT
// (group chips + untranslated logic read it) — unlike the app's useContentQuery.
const STRIP_FIELDS = ["fts", "ftsTokenCount", "text", "_rev"];

/**
 * Browse-mode content query for the CMS overview. Wraps {@link useHybridQuery} (local-first
 * Dexie, supplemented from the API for content older than the CMS's own sync window).
 * Filters are pushed into the Mango selector; paging is the query's own, so `loadMore()`
 * appends to the window instead of re-running the query at a bigger limit.
 *
 * @param opts     reactive getter for the current filter/sort state
 * @param pageSize rows per page, and the size of the first window
 */
export function useContentBrowseQuery(opts: () => ContentOverviewQueryOptions, pageSize: number) {
    const {
        output: raw,
        isFetching: isLoading,
        isLoadingMore,
        hasMore,
        loadMore,
    } = useHybridQueryWithState<ContentDto>(
        () => {
            const o = opts();
            // Browse has no relevance (no query) — fall back to the default field.
            const orderBy: BrowseSortField =
                !o.orderBy || o.orderBy === "relevance" ? "updatedTimeUtc" : o.orderBy;
            const orderDirection = o.orderDirection ?? "desc";
            const publishStatus = o.publishStatus ?? "all";
            const translationStatus = o.translationStatus ?? "all";

            const subtypeClause: MangoSelector =
                o.parentType === DocType.Tag
                    ? { parentTagType: o.tagOrPostType }
                    : { parentPostType: o.tagOrPostType };

            const clauses: MangoSelector[] = [
                { type: DocType.Content },
                { parentType: o.parentType },
                subtypeClause,
            ];

            if (o.tags && o.tags.length)
                clauses.push({ parentTags: { $elemMatch: { $in: o.tags } } });
            if (o.groups && o.groups.length)
                clauses.push({ memberOf: { $elemMatch: { $in: o.groups } } });

            clauses.push(translationStatusSelector(translationStatus, o.languageId));
            // Publish-status filtering is selected-language-only (parity with the old
            // in-memory `publishStatusFilter`, which rejected non-selected-language docs).
            if (publishStatus !== "all") clauses.push({ language: o.languageId });
            clauses.push(...publishStatusSelector(publishStatus));
            clauses.push(...dateRangeSelector(o));

            return {
                selector: { $and: clauses },
                $sort: [{ [orderBy]: orderDirection }],
                $limit: pageSize,
                use_index: USE_INDEX[orderBy],
            };
        },
        // A filter change rebuilds and returns the window to page one; it is the same
        // list each time, and blanking it mid-scroll reads as a bug.
        {
            live: true,
            persistOffline: false,
            cache: false,
            stripFields: STRIP_FIELDS,
            keepPreviousResult: true,
            pageSize,
        },
    );

    // `untranslated` is a cross-doc condition (parent has no selected-language doc) that
    // can't be expressed in one selector — narrow the priority-fallback set client-side.
    const docs = computed<ContentDto[]>(() => {
        const o = opts();
        if ((o.translationStatus ?? "all") !== "untranslated") return raw.value;
        return raw.value.filter((d) => isUntranslatedRow(d, o.languageId));
    });

    // `hasMore` reflects the raw (pre-post-filter) window, so the untranslated filter
    // narrowing a page to nothing doesn't stall the scroll.
    //
    // `isFetching` settles to false when the read completes even if the result is empty; a
    // fires-once watch on `raw` would hang on an empty browse (HybridQuery dedupes [] → []).
    return { docs, isLoading, isLoadingMore, hasMore, loadMore };
}
