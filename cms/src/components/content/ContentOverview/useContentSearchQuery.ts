import {
    useFtsSearch,
    type ContentDto,
    DocType,
    PublishStatus,
    type FtsFilterOptions,
} from "luminary-shared";
import { computed, watch } from "vue";
import type { ContentOverviewQueryOptions } from "./types";
import { isUntranslatedRow } from "./cmsLanguageSelector";
import { sessionNow } from "@/util/sessionNow";

const PAGE_SIZE = 20;
// Bound the re-fill loop so a page that's entirely dropped by client post-filters keeps
// pulling, without ever looping unboundedly when the remaining corpus is all filtered out.
const REFILL_MAX_PAGES = 5;

/**
 * Search-mode content query for the CMS overview. Wraps {@link useFtsSearch}. The CMS has
 * one-month sync cutoff, so search runs against the **local** FTS index for the recent window
 * (online or offline) — the same local-first stance as the overview's browse path. Drafts/expired are searchable
 * because the local engine has no visibility filter; this composable applies the chosen
 * `status` (and the scheduled/expired date split) itself.
 *
 * FTS-supported filters (type / tag / status / language) are passed as options; the rest
 * (group, parent subtype, scheduled-vs-expired date split, untranslated) are post-filtered
 * client-side.
 *
 * Search runs against a single language (the selected working language) — except the
 * `untranslated` filter, which searches across all languages so untranslated parents'
 * other-language matches can surface, then narrows them client-side.
 */
export function useContentSearchQuery(
    opts: () => ContentOverviewQueryOptions,
    /** When true, use fuzzy BM25 relevance ("Show related results"); default strict. */
    related: () => boolean = () => false,
) {
    const queryRef = computed(() => (opts().search ?? "").trim());

    const languageId = computed<string | undefined>(() =>
        (opts().translationStatus ?? "all") === "untranslated" ? undefined : opts().languageId,
    );

    const filters = computed<FtsFilterOptions>(() => {
        const o = opts();
        const f: FtsFilterOptions = { types: [o.parentType] };
        if (o.tags && o.tags.length) f.tags = o.tags;
        const ps = o.publishStatus ?? "all";
        if (ps === "published" || ps === "scheduled" || ps === "expired")
            f.status = PublishStatus.Published;
        else if (ps === "draft") f.status = PublishStatus.Draft;

        // User-selectable date-range filters (independent of publishStatus).
        if (o.publishedAfter != null) f.publishedAfter = o.publishedAfter;
        if (o.publishedBefore != null) f.publishedBefore = o.publishedBefore;
        if (o.expiresAfter != null) f.expiresAfter = o.expiresAfter;
        if (o.expiresBefore != null) f.expiresBefore = o.expiresBefore;

        // Strict (default): substring AND on title/author. Ordered by the overview's sort
        // dropdown — except "relevance", which omits the field sort so the exact matches
        // rank by BM25. Related: omit matchAllWords/sort → fuzzy BM25 over all fields.
        if (!related()) {
            f.matchAllWords = true;
            const orderBy = o.orderBy ?? "updatedTimeUtc";
            if (orderBy !== "relevance") {
                f.sort = { field: orderBy, direction: o.orderDirection ?? "desc" };
            }
        }
        return f;
    });

    const fts = useFtsSearch(queryRef, {
        languageId,
        filters,
        pageSize: PAGE_SIZE,
        strictMatch: () => !related(),
        // Trigger-only: the search box (FilterOptions.vue) only commits queryRef on
        // Enter/Go, so re-run explicitly on each committed change rather than debouncing.
        debounceMs: "manual",
    });
    watch(queryRef, () => fts.runSearch(), { immediate: true });

    const docs = computed<ContentDto[]>(() => {
        const o = opts();
        const now = sessionNow();
        const ps = o.publishStatus ?? "all";
        const translationStatus = o.translationStatus ?? "all";

        return fts.results.value
            .map((r) => r.doc)
            .filter((doc) => {
                // Parent subtype (FTS only knows parentType, not the tag/post subtype).
                const subtype =
                    o.parentType === DocType.Tag ? doc.parentTagType : doc.parentPostType;
                if (subtype !== o.tagOrPostType) return false;

                // Groups (FTS has no memberOf filter).
                if (
                    o.groups &&
                    o.groups.length &&
                    !(doc.memberOf ?? []).some((g) => o.groups!.includes(g))
                )
                    return false;

                // Computed publish states — FTS only filtered to status=Published.
                if (
                    ps === "published" &&
                    !(
                        doc.publishDate != null &&
                        doc.publishDate <= now &&
                        (doc.expiryDate == null || doc.expiryDate > now)
                    )
                )
                    return false;
                if (ps === "scheduled" && !(doc.publishDate != null && doc.publishDate > now))
                    return false;
                if (ps === "expired" && !(doc.expiryDate != null && doc.expiryDate <= now))
                    return false;

                // Untranslated: keep only non-selected-language rows for untranslated parents.
                if (translationStatus === "untranslated" && !isUntranslatedRow(doc, o.languageId))
                    return false;

                return true;
            });
    });

    // Post-filtering can shrink a page below PAGE_SIZE; keep pulling until some new
    // post-filtered rows land or the corpus is exhausted.
    async function loadMore() {
        const before = docs.value.length;
        await fts.loadMore();
        let guard = 0;
        while (fts.hasMore.value && docs.value.length === before && guard < REFILL_MAX_PAGES) {
            guard++;
            await fts.loadMore();
        }
    }

    return {
        docs,
        isLoading: fts.isSearching,
        hasMore: fts.hasMore,
        loadMore,
        isStale: fts.isStale,
        refresh: fts.refresh,
        markStale: fts.markStale,
    };
}
