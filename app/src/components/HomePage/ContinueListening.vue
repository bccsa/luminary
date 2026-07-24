<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { PostType, TagType } from "luminary-shared";
import { computed } from "vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { useI18n } from "vue-i18n";
import { useWatchedMediaIds } from "@/composables/useWatchedMediaIds";

const { t } = useI18n();

const mediaProgressRef = useWatchedMediaIds();
const contentIds = computed(() => mediaProgressRef.value.map((entry) => entry.contentId));

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
    // cacheId disambiguates from ContinueWatching: both query the same shape
    // (`_id $in` + the same $or filters), so without it they would share one cache
    // entry and seed from each other on first paint.
    { cache: true, cacheId: "continue-listening" },
);

// Re-sort to match the listened order, then keep only audio content (has audio
// file collections but no video / HLS stream).
const listenedContent = computed(() => {
    const orderMap = new Map(contentIds.value.map((id, i) => [id, i]));
    return [...content.value]
        .sort((a, b) => (orderMap.get(a._id) ?? 0) - (orderMap.get(b._id) ?? 0))
        .filter(
            (c) => c.parentMedia?.fileCollections?.length && !c.video && !c.parentMedia?.hlsUrl,
        );
});
</script>

<template>
    <HorizontalContentTileCollection
        v-if="listenedContent.length > 0"
        :contentDocs="listenedContent"
        :title="t('home.continueListening')"
        :showPublishDate="true"
        :showProgress="true"
        class="pb-1 pt-4"
    />
</template>
