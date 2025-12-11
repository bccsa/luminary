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

// Always load cache to have it available for restoration, but only use as initialValue if dependencies are ready
const cachedPinnedCategories = await db.getQueryCache<ContentDto[]>("homepage_pinnedCategories");
const shouldUsePinnedCategoriesCache =
    appLanguageIdsAsRef.value.length > 0 &&
    cachedPinnedCategories &&
    cachedPinnedCategories.length > 0;

const pinnedCategories = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) => {
        if (!appLanguageIds.length) return [];

        return db.docs
            .where({
                type: DocType.Content,
                parentPinned: 1,
            })
            .filter((c) => {
                const content = c as ContentDto;
                return isPublished(content, appLanguageIds);
            })
            .toArray() as unknown as Promise<ContentDto[]>;
    },
    {
        initialValue: shouldUsePinnedCategoriesCache ? cachedPinnedCategories : [],
        deep: true,
    },
);

let isRestoringPinnedCategories = false;

watch(
    pinnedCategories as any,
    async (value) => {
        // Prevent infinite loop
        if (isRestoringPinnedCategories) return;

        // If query returned empty but dependencies aren't ready, restore cache
        if (!value || value.length === 0) {
            if (
                !appLanguageIdsAsRef.value.length &&
                cachedPinnedCategories &&
                cachedPinnedCategories.length > 0
            ) {
                isRestoringPinnedCategories = true;
                pinnedCategories.value = cachedPinnedCategories as any;
                isRestoringPinnedCategories = false;
                return;
            }
        }

        // Only save if we have data AND dependencies are ready
        if (value && value.length > 0 && appLanguageIdsAsRef.value.length > 0) {
            db.setQueryCache<ContentDto[]>("homepage_pinnedCategories", value);
        }
    },
    { deep: true, immediate: true },
);

// Always load cache to have it available for restoration, but only use as initialValue if dependencies are ready
const cachedPinnedContent = await db.getQueryCache<ContentDto[]>("homepage_pinnedContent");
// Check appLanguageIds and if we have cached pinnedCategories data (either from cache or already loaded)
const shouldUsePinnedContentCache =
    appLanguageIdsAsRef.value.length > 0 &&
    cachedPinnedContent &&
    cachedPinnedContent.length > 0 &&
    (pinnedCategories.value.length > 0 ||
        (cachedPinnedCategories && cachedPinnedCategories.length > 0));

const pinnedCategoryContent = useDexieLiveQueryWithDeps(
    [appLanguageIdsAsRef, pinnedCategories],
    ([appLanguageIds, pinnedCategories]: [Uuid[], ContentDto[]]) => {
        if (!appLanguageIds.length || !pinnedCategories.length) return [];

        return db.docs
            .where({
                type: DocType.Content,
                status: PublishStatus.Published,
            })
            .filter((c) => {
                const content = c as ContentDto;

                if (content.parentPostType && content.parentPostType == PostType.Page) return false;
                if (content.parentTagType && content.parentTagType !== TagType.Topic) return false;

                if (!content.parentTags) return false;

                for (const tagId of content.parentTags) {
                    if (
                        pinnedCategories.some((p) => p.parentId == tagId) &&
                        isPublished(content, appLanguageIds)
                    )
                        return true;
                }

                return false;
            })
            .toArray() as unknown as Promise<ContentDto[]>;
    },
    {
        initialValue: shouldUsePinnedContentCache ? cachedPinnedContent : [],
        deep: true,
    },
);

let isRestoringPinnedContent = false;

watch(
    pinnedCategoryContent as any,
    async (value) => {
        // Prevent infinite loop
        if (isRestoringPinnedContent) return;

        // If query returned empty but dependencies aren't ready, restore cache
        if (!value || value.length === 0) {
            const depsNotReady =
                !appLanguageIdsAsRef.value.length || !pinnedCategories.value.length;
            if (depsNotReady && cachedPinnedContent && cachedPinnedContent.length > 0) {
                isRestoringPinnedContent = true;
                pinnedCategoryContent.value = cachedPinnedContent as any;
                isRestoringPinnedContent = false;
                return;
            }
        }

        // Only save if we have data AND dependencies are ready
        if (
            value &&
            value.length > 0 &&
            appLanguageIdsAsRef.value.length > 0 &&
            pinnedCategories.value.length > 0
        ) {
            db.setQueryCache<ContentDto[]>("homepage_pinnedContent", value);
        }
    },
    { deep: true, immediate: true },
);

// sort pinned content by category
const pinnedContentByCategory = contentByTag(pinnedCategoryContent as any, pinnedCategories as any);
</script>

<template>
    <HorizontalContentTileCollection
        v-for="(c, index) in pinnedContentByCategory.tagged.value"
        :key="c.tag._id"
        :contentDocs="c.content"
        :title="c.tag.title"
        :summary="c.tag.summary"
        :showPublishDate="false"
        class="bg-yellow-500/10 pb-1 dark:bg-yellow-500/5"
        :class="[
            index == 0 ? 'pt-4' : 'pt-2',
            index == pinnedContentByCategory.tagged.value.length - 1 ? 'pb-3' : '',
        ]"
    />
</template>
