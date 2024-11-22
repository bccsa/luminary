<script setup lang="ts">
import { watch } from "vue";
import {
    type ContentDto,
    DocType,
    PostType,
    TagType,
    type Uuid,
    db,
    useDexieLiveQueryWithDeps,
} from "luminary-shared";
import { appLanguageIdAsRef } from "@/globalConfig";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";

const pinnedCategories = useDexieLiveQueryWithDeps(
    appLanguageIdAsRef,
    (appLanguageId: Uuid) =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageId,
                status: "published",
                parentPinned: 1, // 1 = true
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("homepage_pinnedCategories") },
);

watch(pinnedCategories, async (value) => {
    db.setQueryCache<ContentDto[]>("homepage_pinnedCategories", value);
});

const pinnedCategoryContent = useDexieLiveQueryWithDeps(
    [appLanguageIdAsRef, pinnedCategories],
    ([appLanguageId, pinnedCategories]: [Uuid, ContentDto[]]) =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageId,
                status: "published",
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;

                if (content.parentPostType && content.parentPostType == PostType.Page) return false;
                if (content.parentTagType && content.parentTagType !== TagType.Topic) return false;

                for (const tagId of content.parentTags) {
                    if (pinnedCategories.some((p) => p.parentId == tagId)) return true;
                }
                return false;
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("homepage_pinnedContent") },
);

watch(pinnedCategoryContent, async (value) => {
    db.setQueryCache<ContentDto[]>("homepage_pinnedContent", value);
});

// sort pinned content by category
const pinnedContentByCategory = contentByTag(pinnedCategoryContent, pinnedCategories);
</script>

<template>
    <HorizontalContentTileCollection
        v-for="c in pinnedContentByCategory"
        :key="c.tag._id"
        :contentDocs="c.content"
        :title="c.tag.title"
        :summary="c.tag.summary"
        :showPublishDate="false"
        class="bg-yellow-500/10 pb-3 pt-4 dark:bg-yellow-500/5"
    />
</template>
