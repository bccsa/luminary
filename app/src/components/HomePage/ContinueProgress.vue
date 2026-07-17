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
import { appLanguageIdsAsRef } from "@/globalConfig";
import {
    contentProgressAsRef,
    watchContentProgressStorage,
    type ContentProgressEntry,
} from "@/contentProgress";
import { mangoIsPublished } from "@/util/mangoIsPublished";
import { useI18n } from "vue-i18n";
import { onMounted, onUnmounted } from "vue";

const { t } = useI18n();

onMounted(() => {
    onUnmounted(watchContentProgressStorage());
});

const continuedContent = useDexieLiveQueryWithDeps(
    () => [appLanguageIdsAsRef.value, contentProgressAsRef.value],
    async ([appLanguageIds, progressList]) => {
        const readingProgressList = progressList.filter(
            (entry: ContentProgressEntry) => entry.reading !== undefined,
        );
        if (readingProgressList.length === 0) return [];

        const contentIds = readingProgressList.map(
            (entry: ContentProgressEntry) => entry.contentId,
        );

        const results = await mangoToDexie<ContentDto>(db.docs, {
            selector: {
                $and: [
                    { _id: { $in: contentIds } },
                    { type: DocType.Content },
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
        v-if="continuedContent.length > 0"
        :contentDocs="continuedContent"
        :title="t('home.continue')"
        :showPublishDate="true"
        :showProgress="true"
        class="pb-1 pt-4"
    />
</template>
