<script setup lang="ts">
import { watch } from "vue";
import {
    type ContentDto,
    DocType,
    TagType,
    type Uuid,
    db,
    useDexieLiveQueryWithDeps,
    mangoToDexie,
} from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { contentByTag } from "../contentByTag";
import { mangoIsPublished } from "@/util/mangoIsPublished";

const categories = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) => {
        return mangoToDexie<ContentDto>(db.docs, {
            selector: {
                $and: [
                    { type: DocType.Content },
                    { parentPinned: 1 }, // 1 = true
                    { parentTagType: TagType.Category },
                    ...mangoIsPublished(appLanguageIds),
                ],
            },
        });
    },
    {
        initialValue: await db.getQueryCache<ContentDto[]>("explore_pinnedCategories"),
        deep: true,
    },
);

watch(categories, async (value) => {
    db.setQueryCache<ContentDto[]>("explore_pinnedCategories", value);
});

const topics = useDexieLiveQueryWithDeps(
    [appLanguageIdsAsRef, categories],
    ([appLanguageIds, pinnedCategories]: [Uuid[], ContentDto[]]) => {
        const pinnedCategoryIds = pinnedCategories.map((p) => p.parentId);
        if (pinnedCategoryIds.length === 0) return Promise.resolve([] as ContentDto[]);
        return mangoToDexie<ContentDto>(db.docs, {
            selector: {
                $and: [
                    { type: DocType.Content },
                    { parentType: DocType.Tag },
                    { $or: [{ parentTagType: { $exists: false } }, { parentTagType: TagType.Topic }] },
                    { parentTags: { $elemMatch: { $in: pinnedCategoryIds } } },
                    ...mangoIsPublished(appLanguageIds),
                ],
            },
        });
    },
    { initialValue: await db.getQueryCache<ContentDto[]>("explorepage_pinnedTopics"), deep: true },
);

watch(topics, async (value) => {
    db.setQueryCache<ContentDto[]>("explorepage_pinnedTopics", value);
});

// sort pinned content by category
const topicsByCategory = contentByTag(topics, categories);
</script>

<template>
    <HorizontalContentTileCollection
        v-for="(c, index) in topicsByCategory.tagged.value"
        :key="c.tag._id"
        :contentDocs="c.content"
        :title="c.tag.title"
        aspectRatio="classic"
        contentTitlePosition="center"
        :summary="c.tag.summary"
        :showPublishDate="false"
        class="bg-yellow-500/10 pb-1 dark:bg-yellow-500/5"
        :class="[
            index == 0 ? 'pt-4' : 'pt-2',
            index == topicsByCategory.tagged.value.length - 1 ? 'pb-4' : '',
        ]"
    />
</template>
