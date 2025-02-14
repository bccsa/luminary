<script setup lang="ts">
import { watch } from "vue";
import {
    type ContentDto,
    DocType,
    PostType,
    PublishStatus,
    TagType,
    type Uuid,
    db,
    useDexieLiveQueryWithDeps,
} from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { isPublished } from "@/util/isPublished";
import IgnorePagePadding from "../IgnorePagePadding.vue";

const pinnedCategories = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) =>
        db.docs
            .where({
                type: DocType.Content,
                parentPinned: 1, // 1 = true
            })
            .filter((c) => {
                return isPublished(c as ContentDto, appLanguageIds);
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    {
        initialValue: await db.getQueryCache<ContentDto[]>("videopage_pinnedCategories"),
        deep: true,
    },
);

watch(pinnedCategories, async (value) => {
    db.setQueryCache<ContentDto[]>("videopage_pinnedCategories", value);
});

const pinnedCategoryContent = useDexieLiveQueryWithDeps(
    [appLanguageIdsAsRef, pinnedCategories],
    ([appLanguageIds, pinnedCategories]: [Uuid[], ContentDto[]]) =>
        db.docs
            .where({
                type: DocType.Content,
                status: PublishStatus.Published,
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!content.video) return false;

                if (content.parentPostType && content.parentPostType == PostType.Page) return false;
                if (content.parentTagType && content.parentTagType !== TagType.Topic) return false;

                for (const tagId of content.parentTags) {
                    if (
                        pinnedCategories.some((p) => p.parentId == tagId) &&
                        isPublished(content, appLanguageIds)
                    )
                        return true;
                }

                return false;
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("videopage_pinnedContent") },
);

watch(pinnedCategoryContent, async (value) => {
    db.setQueryCache<ContentDto[]>("videopage_pinnedContent", value);
});

// sort pinned content by category
const pinnedContentByCategory = contentByTag(pinnedCategoryContent, pinnedCategories);
</script>

<template>
    <IgnorePagePadding ignoreTop>
        <HorizontalContentTileCollection
            v-for="c in pinnedContentByCategory"
            :key="c.tag._id"
            :contentDocs="c.content"
            :title="c.tag.title"
            :summary="c.tag.summary"
            :showPublishDate="false"
            class="bg-yellow-500/10 pt-4 dark:bg-yellow-500/5"
        />
    </IgnorePagePadding>
</template>
