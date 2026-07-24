<script setup lang="ts">
import { computed } from "vue";
import { DocType, type ContentDto, type Uuid } from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import { useRecommendations } from "@/composables/useRecommendations";
import { useImpressionTracking } from "@/composables/useImpressionTracking";
import { recordImpressionMiss } from "@/recommendation/affinityStore";
import { useI18n } from "vue-i18n";
import ContentCardRow from "./ContentCardRow.vue";

const LIMIT = 8;
/** Tag-membership only (`useFts: false` below) — this supplementary row doesn't need BM25
 *  search precision, just a handful of tag-matched picks, so the retrieval pool can stay
 *  small and the local FTS/highlight machinery isn't created at all. */
const RETRIEVAL_LIMIT = 100;

const props = defineProps<{
    selectedContent: ContentDto;
    /** Ids already shown by other rows on the page — dropped so nothing appears twice. */
    excludeIds: Set<Uuid>;
}>();

const { t } = useI18n();

// Personalized cross-topic discovery from the VIEWER's own affinity profile (not this
// article's tags) — the same feed the home page shows, run again here at a much smaller,
// FTS-free retrieval budget purely to add one supplementary, labeled row.
const { recommended, topTagIds } = useRecommendations({
    limit: LIMIT,
    retrievalLimit: RETRIEVAL_LIMIT,
    useFts: false,
});

// Resolve the strongest tag's own title, to label the row ("Because you read {tag}").
const tagId = computed(() => topTagIds.value[0]);
const tagDocs = useContentQuery(
    () =>
        tagId.value
            ? [{ parentType: DocType.Tag }, { parentId: { $in: [tagId.value] } }]
            : [{ _id: { $in: [] } }],
    { includeScheduled: false, limit: 1 },
);
const label = computed(() => tagDocs.value[0]?.title);

// `useRecommendations` only filters out content the viewer has dwelled on for a while (see
// `markSeen`'s dwell timer) — on a fresh page load the current article hasn't been marked
// seen yet, so it must be excluded here explicitly, by both id and parentId (translations).
const items = computed(() => {
    if (!label.value) return [];
    return recommended.value.filter(
        (item) =>
            item._id !== props.selectedContent._id &&
            item.parentId !== props.selectedContent.parentId &&
            !props.excludeIds.has(item._id),
    );
});

// Same negative-signal loop `RecommendedForYou` (home page) already applies to this exact
// feed — without it, a row shown-but-ignored here would never correct the profile that
// selected it, unlike identical content shown on the home page.
const { root, onContainerClick } = useImpressionTracking(items, {
    onMiss: (tagIds) => void recordImpressionMiss(tagIds),
});
</script>

<template>
    <section
        v-if="items.length"
        ref="root"
        class="w-full pb-2"
        @click="onContainerClick"
    >
        <ContentCardRow
            :items="items"
            :title="t('content.because_you_read', { tag: label })"
        />
    </section>
</template>
