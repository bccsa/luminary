<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import {
    type ContentDto,
    DocType,
    db,
    PostType,
    TagType,
    mangoToDexie,
    useDexieLiveQueryWithDeps,
} from "luminary-shared";
import {
    appLanguageIdsAsRef,
    readingProgressAsRef,
    watchReadingProgressStorage,
    type ReadingProgress,
} from "@/globalConfig";
import { mangoIsPublished } from "@/util/mangoIsPublished";
import { useI18n } from "vue-i18n";
import { onMounted, onUnmounted } from "vue";

const { t } = useI18n();

onMounted(() => {
    onUnmounted(watchReadingProgressStorage());
});

const watchedContent = useDexieLiveQueryWithDeps(
    () => [appLanguageIdsAsRef.value, readingProgressAsRef.value],
    async ([appLanguageIds, progressList]) => {
        if (progressList.length === 0) return [];

        const contentIds = progressList.map((entry: ReadingProgress) => entry.contentId);

        const results = await mangoToDexie<ContentDto>(db.docs, {
            selector: {
                $and: [
                    { _id: { $in: contentIds } },
                    { type: DocType.Content },
                    { parentPostType: { $ne: PostType.Page } },
                    { parentTagType: { $ne: TagType.Category } },
                    ...mangoIsPublished(appLanguageIds),
                ],
            },
        });

        const orderMap = new Map<string, number>(
            contentIds.map((id: string, i: number) => [id, i]),
        );
        results.sort((a, b) => (orderMap.get(a._id) ?? 0) - (orderMap.get(b._id) ?? 0));

        return results;
    },
    {
        initialValue: [],
        deep: true,
    },
);
</script>

<template>
    <HorizontalContentTileCollection
        v-if="watchedContent.length > 0"
        :contentDocs="watchedContent"
        :title="t('home.continue.read')"
        :showPublishDate="true"
        class="pt-4 pb-1"
    />
</template>
