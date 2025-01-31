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

const unpinnedCategories = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) =>
        db.docs
            .where({
                type: DocType.Content,
                parentPinned: 0, // 1 = true
            })
            .filter((c) => {
                return isPublished(c as ContentDto, appLanguageIds);
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    {
        initialValue: await db.getQueryCache<ContentDto[]>("videopage_unpinnedCategories"),
        deep: true,
    },
);

watch(unpinnedCategories, async (value) => {
    db.setQueryCache<ContentDto[]>("videopage_unpinnedCategories", value);
});

const unpinnedCategoryContent = useDexieLiveQueryWithDeps(
    [appLanguageIdsAsRef, unpinnedCategories],
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

watch(unpinnedCategoryContent, async (value) => {
    db.setQueryCache<ContentDto[]>("videopage_pinnedContent", value);
});

// sort pinned content by category
const unpinnedContentByCategory = contentByTag(unpinnedCategoryContent, unpinnedCategories);
</script>

<template>
    <IgnorePagePadding>
        <HorizontalContentTileCollection
            v-for="c in unpinnedContentByCategory"
            :key="c.tag._id"
            :contentDocs="c.content"
            :title="c.tag.title"
            :summary="c.tag.summary"
            :showPublishDate="false"
        />
    </IgnorePagePadding>
</template>
