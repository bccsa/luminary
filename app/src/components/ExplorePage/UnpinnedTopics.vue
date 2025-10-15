<script setup lang="ts">
import { watch } from "vue";
import { type ContentDto, DocType, TagType, type Uuid, db } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfigOld";
import { useDexieLiveQueryWithDeps } from "luminary-shared";
import { isPublished } from "@/util/isPublished";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const topics = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) =>
        db.docs
            .where({
                type: DocType.Content,
                status: "published",
                parentTagType: TagType.Topic,
            })
            .filter((c) => {
                const content = c as ContentDto;
                return !!(
                    isPublished(content, appLanguageIds) &&
                    content.parentTaggedDocs &&
                    content.parentTaggedDocs.length > 0
                );
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    {
        initialValue: await db.getQueryCache<ContentDto[]>("explorepage_unpinnedTopics"),
        deep: true,
    },
);

const categories = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) =>
        db.docs
            .where({
                type: DocType.Content,
                status: "published",
                parentTagType: TagType.Category,
            })
            .filter((c) => {
                if (c.parentPinned) return false; // Only unpinned categories
                return isPublished(c as ContentDto, appLanguageIds);
            })

            .toArray() as unknown as Promise<ContentDto[]>,
    {
        initialValue: await db.getQueryCache<ContentDto[]>("explorepage_unpinnedCategories"),
        deep: true,
    },
);

watch(topics, async (value) => {
    db.setQueryCache<ContentDto[]>("explorepage_unpinnedTopics", value);
});

watch(categories, async (value) => {
    db.setQueryCache<ContentDto[]>("explorepage_unpinnedCategories", value);
});

const topicsByCategory = contentByTag(topics, categories, { includeUntagged: true });
</script>

<template>
    <HorizontalContentTileCollection v-for="(c, index) in topicsByCategory.tagged.value" :key="c.tag._id"
        :contentDocs="c.content" :title="c.tag.title" aspectRatio="classic" contentTitlePosition="center"
        :summary="c.tag.summary" class="pb-1" :class="index == 0 ? 'pt-4' : 'pt-2'" />
    <HorizontalContentTileCollection v-if="topicsByCategory.untagged.value.length"
        :contentDocs="topicsByCategory.untagged.value" :title="t('explore.other')" aspectRatio="classic"
        contentTitlePosition="center" class="pb-1 pt-2" />
</template>
