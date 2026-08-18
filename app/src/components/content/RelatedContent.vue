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
// with the current article removed. Exclude by `parentId` rather than `_id` so a different
// translation of the article being read (same parent, different `_id`) doesn't reappear as a
// duplicate card below it. The query's `limit` is the overall cap; per-breakpoint display
// (mobile infinite scroll, desktop full scroll row) is ReadMore's job.
const relatedContent = computed(() =>
    contentDocs.value.filter((item) => item.parentId !== props.selectedContent.parentId),
);

// Re-order the related articles to stay relevant to the one being read, and drop
// already-seen articles. Retrieval stays purely topical (the query above); `rank` only tilts
// order, primarily by tag overlap with the current article (`referenceTagIds`), with recency
// as a secondary order and affinity a mild tie-break (see `READ_MORE_AFFINITY_WEIGHT`). A cold
// profile or single-topic article falls back to recency order (newest first), matching the
// previous publishDate-desc behaviour. No `limit` and a relaxed MMR cap ⇒ rank itself drops
// nothing; the 12-item cap is applied after, so the top-ranked cards survive.
const topicTagIds = computed(() => new Set(props.tags.map((tag) => tag.parentId)));
const referenceTagIds = computed(() => new Set(props.selectedContent.parentTags ?? []));
// Tempered from the default TAG_LEG_WEIGHT (1.5): the affinity term is
// `tagWeight · affinityScore_nominal` (scoreScale already normalizes raw → nominal), so a
// typical tag (~0.5) contributes ~0.005 and a heavily-engaged one (~2) ~0.02 — both below the
// recency prior's 0.05 span. Affinity thus only breaks near-ties within a recency band instead
// of dominating the order. Tunable.
const READ_MORE_AFFINITY_WEIGHT = 0.01;
// Read more is a focused topical sidebar, not an endless feed — cap the section so it never
// grows past a handful of cards.
const READ_MORE_MAX_ITEMS = 12;
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
    // The grid shows related articles only — the dedicated topic cards (props.tags) are no
    // longer mixed in, since the section is already topical. Already-seen articles are still
    // excluded (that filter is for read articles, not topic cards).
    const candidates = relatedContent.value.filter((item) => !seenIds.value.has(item._id));
    const ranked = rank(candidates, [], decayedAffinity.value, {
        topicTagIds: topicTagIds.value,
        scoreScale,
        tagWeight: READ_MORE_AFFINITY_WEIGHT,
        referenceTagIds: referenceTagIds.value,
        referenceWeight: 1.0,
        maxPerDominantTag: 100,
    });
    return ranked.slice(0, READ_MORE_MAX_ITEMS);
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
