<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { PostType, TagType } from "luminary-shared";
import { computed, onMounted, onUnmounted } from "vue";
import { useContentQuery } from "@/composables/useContentQuery";
import {
    contentProgressAsRef,
    watchContentProgressStorage,
    type ContentProgressEntry,
} from "@/contentProgress";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

onMounted(() => {
    onUnmounted(watchContentProgressStorage());
});

// Progress entries are recency-ordered; keep any with reading or watching progress.
const contentIds = computed<string[]>(() =>
    contentProgressAsRef.value
        .filter(
            (entry: ContentProgressEntry) =>
                entry.reading !== undefined || entry.watching !== undefined,
        )
        .map((entry: ContentProgressEntry) => entry.contentId),
);

const content = useContentQuery(
    () => [
        { _id: { $in: contentIds.value } },
        {
            $or: [
                { parentPostType: { $exists: false } },
                { parentPostType: { $ne: PostType.Page } },
            ],
        },
        {
            $or: [
                { parentTagType: { $exists: false } },
                { parentTagType: { $ne: TagType.Category } },
            ],
        },
    ],
    // cacheId disambiguates from ContinueListening: both query the same shape
    // (`_id $in` + the same $or filters), so without it they would share one cache
    // entry and seed from each other on first paint.
    { cache: true, cacheId: "continue-progress" },
);

// Re-sort to match the progress recency order.
const continuedContent = computed(() => {
    const orderMap = new Map(contentIds.value.map((id, i) => [id, i]));
    return [...content.value].sort(
        (a, b) => (orderMap.get(a._id) ?? 0) - (orderMap.get(b._id) ?? 0),
    );
});
</script>

<template>
    <HorizontalContentTileCollection
        v-if="continuedContent.length > 0"
        :contentDocs="continuedContent"
        :title="t('home.continue')"
        :showPublishDate="true"
        :showProgress="true"
        class="pb-1 pt-4"
    />
</template>
