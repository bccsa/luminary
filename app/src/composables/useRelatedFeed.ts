import { computed, onScopeDispose, ref, watch } from "vue";
import type { ContentDto } from "luminary-shared";
import { useContentQueryWithState } from "@/composables/useContentQueryWithState";
import { useMoreLikeThis } from "@/composables/useMoreLikeThis";
import { useRecommendations } from "@/composables/useRecommendations";
import { selectSeriesTag, MAX_SERIES_TAG_SIZE } from "@/composables/seriesTag";

/** Overall cap on the merged feed. */
const DEFAULT_LIMIT = 10;
const AUTHOR_RETRIEVAL_LIMIT = 10;
/** Lowest-priority leg (global cross-topic affinity) stays tag-only — it's filler beneath
 *  the topical leg below, so it doesn't need local-FTS search-grade precision or its cost. */
const AFFINITY_RETRIEVAL_LIMIT = 100;
/** Coalesces the burst of independent async leg resolutions (series/similar/author/
 *  affinity each resolve at a different time) into one stable snapshot, instead of
 *  reflowing the visible list every time any single leg updates. */
const SETTLE_DEBOUNCE_MS = 250;

export type UseRelatedFeedOptions = { limit?: number };

/**
 * One capped, deduplicated "Read more" feed for an article page: a single priority-ordered
 * merge instead of four separate rows.
 *
 *  1. Series neighbours (prev/next in the article's own series-sized tag) — a structural
 *     pick, not an affinity output, so pinned first rather than ranked.
 *  2. `useMoreLikeThis` — topical content seeded from THIS article's own tags, tilted by the
 *     viewer's affinity. The primary driver: current-topic relevance wins.
 *  3. Other content by the same author.
 *  4. `useRecommendations` — the viewer's global cross-topic affinity feed (tag-only, see
 *     above). Lowest priority: only fills slots the more topical legs leave empty.
 *  5. The topic tag docs themselves (the topic pages this article belongs to), so they keep
 *     appearing in "Read more" the way the old flat list included them.
 *
 * Each leg excludes ids already claimed by an earlier leg; the merged list is capped at
 * `limit` (default 10).
 */
export function useRelatedFeed(
    getSelectedContent: () => ContentDto,
    getTopicTags: () => ContentDto[],
    { limit = DEFAULT_LIMIT }: UseRelatedFeedOptions = {},
) {
    const selectedContent = computed(getSelectedContent);
    const topicTags = computed(getTopicTags);

    // --- 1. Series neighbours -------------------------------------------------
    const seriesTag = computed(() => selectSeriesTag(topicTags.value));
    const seriesTagIds = computed(() =>
        (seriesTag.value?.parentTaggedDocs ?? []).filter((id): id is string => id != null),
    );
    const { output: seriesDocs, isFetching: seriesFetching } = useContentQueryWithState(
        () =>
            seriesTagIds.value.length
                ? [{ parentId: { $in: seriesTagIds.value } }]
                : [{ _id: { $in: [] } }],
        { includeScheduled: false, sort: [{ publishDate: "asc" }], limit: MAX_SERIES_TAG_SIZE },
    );
    const seriesItems = computed(() => {
        const docs = seriesDocs.value;
        const idx = docs.findIndex((doc) => doc.parentId === selectedContent.value.parentId);
        if (idx === -1) return [];
        return [docs[idx - 1], docs[idx + 1]].filter((doc): doc is ContentDto => !!doc);
    });

    // --- 2. Topical "similar" content (primary topic-preference driver) ------
    const { similar, ready: similarReady } = useMoreLikeThis(getSelectedContent, getTopicTags, {
        limit,
    });
    const similarItems = computed(() => {
        const seriesIds = new Set(seriesItems.value.map((item) => item._id));
        return similar.value.filter((item) => !seriesIds.has(item._id));
    });

    // --- 3. Other content by the same author ----------------------------------
    const { output: authorContentDocs, isFetching: authorFetching } = useContentQueryWithState(
        () =>
            selectedContent.value.author
                ? [{ author: selectedContent.value.author }]
                : [{ _id: { $in: [] } }],
        { includeScheduled: false, sort: [{ publishDate: "desc" }], limit: AUTHOR_RETRIEVAL_LIMIT },
    );
    const authorItems = computed(() => {
        const shown = new Set([...seriesItems.value, ...similarItems.value].map((item) => item._id));
        return authorContentDocs.value.filter(
            (item) => item._id !== selectedContent.value._id && !shown.has(item._id),
        );
    });

    // --- 4. Global affinity feed (lowest-priority filler) ---------------------
    const { recommended, ready: affinityReady } = useRecommendations({
        limit,
        retrievalLimit: AFFINITY_RETRIEVAL_LIMIT,
        useFts: false,
    });
    // All four legs must have resolved at least once before any snapshot is shown — gating on
    // just the FTS leg (as a prior version of this file did) isn't enough: series/author are
    // separate async Dexie reads that can still be in flight when the FTS leg happens to
    // settle first, so a "ready" commit could still capture a snapshot missing one of them,
    // which then visibly updates moments later once it lands.
    const allReady = computed(
        () =>
            !seriesFetching.value &&
            !authorFetching.value &&
            affinityReady.value &&
            similarReady.value,
    );
    const affinityItems = computed(() => {
        const shown = new Set(
            [...seriesItems.value, ...similarItems.value, ...authorItems.value].map(
                (item) => item._id,
            ),
        );
        return recommended.value.filter(
            (item) =>
                item._id !== selectedContent.value._id &&
                item.parentId !== selectedContent.value.parentId &&
                !shown.has(item._id),
        );
    });

    // --- 5. The topic tag docs themselves (final filler) ----------------------
    const topicTagItems = computed(() => {
        const shown = new Set(
            [
                ...seriesItems.value,
                ...similarItems.value,
                ...authorItems.value,
                ...affinityItems.value,
            ].map((item) => item._id),
        );
        return topicTags.value.filter((tag) => !shown.has(tag._id));
    });

    // --- Merge: series pinned first, then priority-ordered fill to `limit` ----
    const rawItems = computed(() => {
        const merged = [
            ...seriesItems.value,
            ...similarItems.value,
            ...authorItems.value,
            ...affinityItems.value,
            ...topicTagItems.value,
        ];
        // Defensive final dedupe: the per-leg exclude sets above already prevent duplicates
        // in practice, but a single guaranteed pass here is cheap and makes that a guarantee
        // rather than an invariant callers must trust.
        const seen = new Set<string>();
        const deduped = merged.filter((item) => {
            if (seen.has(item._id)) return false;
            seen.add(item._id);
            return true;
        });
        return deduped.slice(0, limit);
    });

    // Every leg above resolves independently and at a different speed (fast Dexie reads vs.
    // useMoreLikeThis's internally-debounced FTS leg), so `rawItems` can reorder several
    // times in quick succession as they land. Expose only a settled snapshot — otherwise
    // the visible list (and ReadMore's infinite-scroll/measurement state, which resets on
    // every `items` change) visibly reflows after already rendering something.
    // Start empty rather than seeding synchronously from `rawItems.value`: any leg can still
    // be empty until `allReady` flips, so an immediate snapshot could be missing content and
    // then visibly swap it in once every retrieval resolves — exactly the bug this gate
    // exists to prevent.
    const items = ref<ContentDto[]>([]);
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    watch(
        [rawItems, allReady],
        ([value, ready]) => {
            // Hold back every snapshot until every leg has completed its own retrieval —
            // committing early would show a list missing one, then swap it in moments later
            // once it resolves.
            if (!ready) return;
            if (settleTimer) clearTimeout(settleTimer);
            settleTimer = setTimeout(() => {
                items.value = value;
            }, SETTLE_DEBOUNCE_MS);
        },
        { immediate: true },
    );
    onScopeDispose(() => clearTimeout(settleTimer));

    return { items, ready: allReady };
}
