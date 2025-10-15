<script setup lang="ts">
import { watch } from "vue";
import {
    type ContentDto,
    DocType,
    PublishStatus,
    TagType,
    type Uuid,
    db,
    useDexieLiveQueryWithDeps,
} from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfigOld";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { contentByTag } from "../contentByTag";
import { isPublished } from "@/util/isPublished";

const categories = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) =>
        db.docs
            .where({
                type: DocType.Content,
                parentPinned: 1, // 1 = true
            })
            .filter((c) => {
                if (c.parentTagType !== TagType.Category) return false;
                return isPublished(c as ContentDto, appLanguageIds);
            })
            .toArray() as unknown as Promise<ContentDto[]>,
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
    ([appLanguageIds, pinnedTopics]: [Uuid[], ContentDto[]]) =>
        db.docs
            .where({
                type: DocType.Content,
                status: PublishStatus.Published,
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!isPublished(content, appLanguageIds)) return false;

                if (content.parentType != DocType.Tag) return false;
                if (content.parentTagType && content.parentTagType !== TagType.Topic) return false;

                for (const tagId of content.parentTags) {
                    if (
                        pinnedTopics.some((p) => p.parentId == tagId) &&
                        isPublished(content, appLanguageIds)
                    )
                        return true;
                }

                return false;
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("explorepage_pinnedTopics"), deep: true },
);

watch(topics, async (value) => {
    db.setQueryCache<ContentDto[]>("explorepage_pinnedTopics", value);
});

// sort pinned content by category
const topicsByCategory = contentByTag(topics, categories);
</script>

<template>
    <HorizontalContentTileCollection v-for="(c, index) in topicsByCategory.tagged.value" :key="c.tag._id"
        :contentDocs="c.content" :title="c.tag.title" aspectRatio="classic" contentTitlePosition="center"
        :summary="c.tag.summary" :showPublishDate="false" class="bg-yellow-500/10 pb-1 dark:bg-yellow-500/5" :class="[
            index == 0 ? 'pt-4' : 'pt-2',
            index == topicsByCategory.tagged.value.length - 1 ? 'pb-4' : '',
        ]" />
</template>
