import {
    useHybridQueryWithState,
    type ContentDto,
    DocType,
    type MangoSelector,
} from "luminary-shared";
import { appDisplayLanguageIdsAsRef } from "@/globalConfig";
import { mangoIsPublished } from "@/util/mangoIsPublished";
import type { UseContentQueryOptions } from "@/composables/useContentQuery";

/**
 * Same query-building as {@link useContentQuery}, but exposes the full HybridQuery state
 * (notably `isFetching`) instead of just the output array — for callers that need a reliable
 * "this query has resolved at least once" signal (e.g. to combine several queries' readiness
 * into one gate), not just the current value. `isFetching` is settled correctly even when a
 * query's selector short-circuits to a provably-empty result (unlike watching the output ref
 * itself for a change, which never fires in that case — see HybridQuery's short-circuit
 * branch).
 */
export function useContentQueryWithState(
    selector: () => MangoSelector[],
    options: UseContentQueryOptions = {},
) {
    const {
        sort,
        limit,
        includeScheduled,
        publishedFilter = true,
        languageFilter = true,
        useIndex = "content-publishDate-index",
        live = true,
        cache = false,
        persistOffline = true,
        stripFields = ["fts", "ftsTokenCount", "text", "memberOf", "_rev"],
        ...rest
    } = options;

    return useHybridQueryWithState<ContentDto>(
        () => ({
            selector: {
                $and: [
                    { type: DocType.Content },
                    ...selector(),
                    ...(publishedFilter
                        ? mangoIsPublished(languageFilter ? appDisplayLanguageIdsAsRef.value : [], {
                              includeScheduled,
                          })
                        : []),
                ],
            },
            ...(sort ? { $sort: sort } : {}),
            ...(limit !== undefined ? { $limit: limit } : {}),
            use_index: useIndex,
        }),
        { live, cache, persistOffline, stripFields, ...rest },
    );
}
