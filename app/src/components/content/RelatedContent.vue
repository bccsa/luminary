<script lang="ts">
import type { ContentDto } from "luminary-shared";

/** Below this, a tag doesn't have enough siblings to read as a sequence at all. */
export const MIN_SERIES_TAG_SIZE = 2;
/** Above this, a tag reads as a broad topic/category rather than an ordered mini-collection —
 *  there's no dedicated series/order concept in the schema, so tag size is the only proxy
 *  available; keeping this low biases toward not showing a series rather than a wrong one. */
export const MAX_SERIES_TAG_SIZE = 20;

/**
 * Pick the most series-like tag among an article's own tags: the smallest one whose
 * tagged-doc count falls in the plausible range above. Exported for unit testing.
 */
export function selectSeriesTag(tags: ContentDto[]): ContentDto | undefined {
    let best: ContentDto | undefined;
    let bestSize = Infinity;
    for (const tag of tags) {
        const size = (tag.parentTaggedDocs ?? []).filter((id) => id != null).length;
        if (size < MIN_SERIES_TAG_SIZE || size > MAX_SERIES_TAG_SIZE) continue;
        if (size < bestSize) {
            best = tag;
            bestSize = size;
        }
    }
    return best;
}
</script>

<script setup lang="ts">
import { TagType, type Uuid } from "luminary-shared";
import { computed, ref } from "vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { useI18n } from "vue-i18n";
import ReadMore from "./ReadMore.vue";
import ContentCardRow from "./ContentCardRow.vue";
import LazyMount from "../common/LazyMount.vue";
import SimilarContentRow from "./SimilarContentRow.vue";
import BecauseYouReadRow from "./BecauseYouReadRow.vue";

const AUTHOR_RETRIEVAL_LIMIT = 10;

type Props = {
    tags: ContentDto[];
    selectedContent: ContentDto;
};
const props = defineProps<Props>();

const { t } = useI18n();

// Topic pages already list their own content, so the "Read more" block is for non-topics.
const isNotTopic = computed(() => props.selectedContent.parentTagType !== TagType.Topic);

// Ids of posts tagged with any of the current article's topic tags. `parentTaggedDocs`
// is optional and may contain null/undefined holes — drop them before they become
// `{ parentId: { $in: [null] } }`, which crashes CouchDB's _find. `new Set` dedupes.
const contentIds = computed(() => [
    ...new Set(props.tags.flatMap((tag) => tag.parentTaggedDocs ?? []).filter((id) => id != null)),
]);

const contentDocs = useContentQuery(() => [{ parentId: { $in: contentIds.value } }], {
    includeScheduled: false,
    sort: [{ publishDate: "desc" }],
    limit: 50,
});

// One flat, newest-first list (dedup is inherent — a single query, not one row per tag),
// with the current article removed. The query's `limit` is the overall cap; per-breakpoint
// display (mobile infinite scroll, desktop full scroll row) is ReadMore's job.
const relatedContent = computed(() =>
    contentDocs.value.filter((item) => item._id !== props.selectedContent._id),
);

// Topic pages and their related posts belong in one collection. Keep the related
// posts first and deduplicate by document id in case the inputs ever overlap.
const readMoreItemsAll = computed(() =>
    [...relatedContent.value, ...props.tags].filter(
        (item, index, items) => items.findIndex(({ _id }) => _id === item._id) === index,
    ),
);

// The most series-like of the article's own tags (see `selectSeriesTag`), used to find a
// prev/next neighbour below. A dedicated query, sorted ascending and scoped to just that
// tag's own members — NOT reused from `contentDocs` above, which is capped at 50 across the
// UNION of every tag and sorted the other direction, so a broad sibling tag could silently
// push this tag's own members out of that pool.
const seriesTag = computed(() => selectSeriesTag(props.tags));
const seriesTagIds = computed(() =>
    (seriesTag.value?.parentTaggedDocs ?? []).filter((id): id is string => id != null),
);
const seriesDocs = useContentQuery(
    () =>
        seriesTagIds.value.length
            ? [{ parentId: { $in: seriesTagIds.value } }]
            : [{ _id: { $in: [] } }],
    { includeScheduled: false, sort: [{ publishDate: "asc" }], limit: MAX_SERIES_TAG_SIZE },
);

// Located by parentId (one query result per translation-collapsed post), not `_id` — the
// current article's own document may be a different translation than the one this query
// returned for that parentId.
const seriesItems = computed(() => {
    const docs = seriesDocs.value;
    const idx = docs.findIndex((doc) => doc.parentId === props.selectedContent.parentId);
    if (idx === -1) return [];
    return [docs[idx - 1], docs[idx + 1]].filter((doc): doc is ContentDto => !!doc);
});

// Drop series neighbours from the flat Read more list so a doc doesn't appear twice.
const readMoreItems = computed(() => {
    const seriesIds = new Set(seriesItems.value.map((item) => item._id));
    return readMoreItemsAll.value.filter((item) => !seriesIds.has(item._id));
});

// "Similar articles" runs its own local FTS pipeline (title/summary + this article's own
// saved highlights) — real CPU cost, and this row is below the fold on every article view.
// It's deferred behind LazyMount (see template) so that work doesn't compete with the
// article's own render at mount; because it isn't mounted yet at that point, it can't
// synchronously contribute to the dedup sets below the way readMoreItems/seriesItems do —
// it bubbles its resolved list back up via `resolved` once it does mount and compute.
const similarItemIds = ref<Set<Uuid>>(new Set());
const similarExcludeIds = computed(
    () => new Set([...readMoreItems.value, ...seriesItems.value].map((item) => item._id)),
);

// Other content by the same byline. No dedicated index exists for `author` — same
// unindexed-selector tradeoff the `parentId` lookup above already accepts.
const authorContentDocs = useContentQuery(
    () =>
        props.selectedContent.author
            ? [{ author: props.selectedContent.author }]
            : [{ _id: { $in: [] } }],
    { includeScheduled: false, sort: [{ publishDate: "desc" }], limit: AUTHOR_RETRIEVAL_LIMIT },
);

const authorItems = computed(() => {
    const shown = new Set([...readMoreItems.value, ...seriesItems.value].map((item) => item._id));
    for (const id of similarItemIds.value) shown.add(id);
    return authorContentDocs.value.filter(
        (item) => item._id !== props.selectedContent._id && !shown.has(item._id),
    );
});

// "Because you read" is the single most expensive row (a second tag+FTS retrieval pipeline)
// and, like Similar, is deferred behind LazyMount — see BecauseYouReadRow for the FTS-free
// (`useFts: false`) leg that also lightens it once it does mount.
const becauseYouReadExcludeIds = computed(() => {
    const shown = new Set(
        [...readMoreItems.value, ...seriesItems.value, ...authorItems.value].map(
            (item) => item._id,
        ),
    );
    for (const id of similarItemIds.value) shown.add(id);
    return shown;
});
</script>

<template>
    <!-- Compact horizontal-scroll rows first (quick, specific picks), the full "Read more"
         vertical/grid list last (the exhaustive option once those are scanned). All rows
         share ContentCard's visual design so they read as one page, not a component patchwork.
         Similar and Because-you-read are each other-fold rows whose own composables run real
         local FTS work, so LazyMount defers even mounting them until they scroll near-view —
         not just hiding their template — so that work never competes with the article's own
         initial render. -->
    <section
        v-if="isNotTopic && seriesItems.length"
        class="w-full pb-2"
    >
        <ContentCardRow
            :items="seriesItems"
            :title="t('content.series_title')"
        />
    </section>

    <LazyMount v-if="isNotTopic">
        <SimilarContentRow
            :selected-content="selectedContent"
            :tags="tags"
            :exclude-ids="similarExcludeIds"
            @resolved="(items) => (similarItemIds = new Set(items.map((item) => item._id)))"
        />
    </LazyMount>

    <section
        v-if="isNotTopic && authorItems.length"
        class="w-full pb-2"
    >
        <ContentCardRow
            :items="authorItems"
            :title="t('content.more_from_author', { author: selectedContent.author })"
        />
    </section>

    <LazyMount v-if="isNotTopic">
        <BecauseYouReadRow
            :selected-content="selectedContent"
            :exclude-ids="becauseYouReadExcludeIds"
        />
    </LazyMount>

    <section
        v-if="isNotTopic && readMoreItems.length"
        class="w-full pb-2"
    >
        <!-- Horizontal padding mirrors the list/grid inset in ReadMore so the heading
             lines up with the first card at every breakpoint. Same yellow accent-bar
             heading style as ContentCardRow's rows above and the home page's sections. -->
        <h2
            class="flex items-baseline gap-2 px-4 pb-3 text-xl text-zinc-800 dark:text-zinc-200 sm:px-8"
        >
            <span
                class="h-4 w-1 shrink-0 self-center rounded-l-full bg-yellow-400/50"
                aria-hidden="true"
            ></span>
            <span class="truncate">{{ t("content.read_more") }}</span>
        </h2>
        <ReadMore :items="readMoreItems" />
    </section>
</template>
