<script setup lang="ts">
import { TagType, decay, type ContentDto } from "luminary-shared";
import { computed } from "vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { rank, affinityScoreScale } from "@/recommendation/ranking";
import { affinityProfile } from "@/recommendation/affinityStore";
import { affinityConfig } from "@/recommendation/defaultAffinityStore";
import { getSeenArticleIds, seenVersion } from "@/recommendation/seenStore";
import { sessionNow } from "@/util/sessionNow";
import { useI18n } from "vue-i18n";
import ReadMore from "./ReadMore.vue";

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

// Re-order the topic candidates to stay relevant to the article being read, and drop
// already-seen articles. Retrieval stays purely topical (the query above); `rank` only tilts
// order. Primary signal is tag overlap with the current article (`referenceTagIds`):
// candidates sharing more of the article's own tags rise, so content from an incidental topic
// tag (e.g. Covid-19 on a self-help article) sinks instead of being promoted. Recency orders
// within a relevance band; affinity is a mild tie-break nudge only (see
// `READ_MORE_AFFINITY_WEIGHT`). A cold profile or single-topic article → uniform overlap →
// recency order (newest first), matching the previous publishDate-desc behaviour. No `limit`
// and a relaxed MMR cap ⇒ relevance ordering is preserved and nothing is dropped.
const topicTagIds = computed(() => new Set(props.tags.map((tag) => tag.parentId)));
const referenceTagIds = computed(() => new Set(props.selectedContent.parentTags ?? []));
// Tempered from the default TAG_LEG_WEIGHT (1.5): the affinity term is
// `tagWeight · affinityScore_nominal` (scoreScale already normalizes raw → nominal), so a
// typical tag (~0.5) contributes ~0.005 and a heavily-engaged one (~2) ~0.02 — both below the
// recency prior's 0.05 span. Affinity thus only breaks near-ties within a recency band instead
// of dominating the order. Tunable.
const READ_MORE_AFFINITY_WEIGHT = 0.01;
const decayedAffinity = computed(
    () => decay(affinityProfile.value, sessionNow(), affinityConfig.value).affinity,
);
const scoreScale = affinityScoreScale(affinityConfig.value.eventWeight.completion);
const seenIds = computed(() => {
    // Track seenVersion so the list updates if markSeen fires mid-session.
    seenVersion.value;
    return new Set(getSeenArticleIds());
});

const readMoreItems = computed(() => {
    const candidates = relatedContent.value.filter((item) => !seenIds.value.has(item._id));
    const ranked = rank(candidates, [], decayedAffinity.value, {
        topicTagIds: topicTagIds.value,
        scoreScale,
        tagWeight: READ_MORE_AFFINITY_WEIGHT,
        referenceTagIds: referenceTagIds.value,
        referenceWeight: 1.0,
        maxPerDominantTag: 100,
    });
    // Topic tags themselves belong in the same collection (browse-the-topic cards),
    // kept last and deduplicated by document id in case the inputs ever overlap.
    return [...ranked, ...props.tags].filter(
        (item, index, items) => items.findIndex(({ _id }) => _id === item._id) === index,
    );
});
</script>

<template>
    <section
        v-if="isNotTopic && readMoreItems.length"
        class="w-full pb-2"
    >
        <!-- Horizontal padding mirrors the list/grid inset in ReadMore so the heading
             lines up with the first card at every breakpoint. -->
        <h2 class="px-4 pb-3 text-xl text-zinc-800 dark:text-zinc-200 sm:px-8">
            {{ t("content.read_more") }}
        </h2>
        <ReadMore :items="readMoreItems" />
    </section>
</template>
