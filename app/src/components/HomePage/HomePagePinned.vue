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

// Always load cache and use as initialValue if it exists - query will update when dependencies are ready
let cachedPinnedCategories: ContentDto[] | undefined;
try {
    cachedPinnedCategories = await db.getQueryCache<ContentDto[]>("homepage_pinnedCategories");
} catch (error) {
    console.warn("Failed to load pinned categories cache:", error);
    cachedPinnedCategories = [];
}

const pinnedCategories = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) => {
        // Don't return empty array if we have cached data and dependencies aren't ready yet
        // This prevents overwriting the cached value
        if (!appLanguageIds.length) {
            // Return undefined to keep current value, or return cached value if available
            return cachedPinnedCategories && cachedPinnedCategories.length > 0
                ? Promise.resolve(cachedPinnedCategories)
                : [];
        }

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
        initialValue: cachedPinnedCategories || [],
        deep: true,
    },
);

watch(
    pinnedCategories as any,
    async (value) => {
        // Only save if we have data AND dependencies are ready
        // Don't save empty arrays when dependencies aren't ready
        if (value && value.length > 0 && appLanguageIdsAsRef.value.length > 0) {
            try {
                await db.setQueryCache<ContentDto[]>("homepage_pinnedCategories", value);
            } catch (error) {
                console.warn("Failed to save pinned categories cache:", error);
            }
        }
    },
    { deep: true, immediate: true },
);

// Clear cache when languages change to prevent stale data
watch(
    () => appLanguageIdsAsRef.value,
    async (newLanguages, oldLanguages) => {
        if (JSON.stringify(newLanguages) !== JSON.stringify(oldLanguages)) {
            try {
                await db.setQueryCache("homepage_pinnedCategories", []);
                await db.setQueryCache("homepage_pinnedContent", []);
            } catch (error) {
                console.warn("Failed to clear cache on language change:", error);
            }
        }
    },
    { deep: true },
);

// Always load cache and use as initialValue if it exists - query will update when dependencies are ready
let cachedPinnedContent: ContentDto[] | undefined;
try {
    cachedPinnedContent = await db.getQueryCache<ContentDto[]>("homepage_pinnedContent");
} catch (error) {
    console.warn("Failed to load pinned content cache:", error);
    cachedPinnedContent = [];
}

const pinnedCategoryContent = useDexieLiveQueryWithDeps(
    [appLanguageIdsAsRef, pinnedCategories],
    ([appLanguageIds, pinnedCategories]: [Uuid[], ContentDto[]]) => {
        // Don't return empty array if we have cached data and dependencies aren't ready yet
        if (!appLanguageIds.length || !pinnedCategories.length) {
            // Return cached value if available, otherwise empty array
            return cachedPinnedContent && cachedPinnedContent.length > 0
                ? Promise.resolve(cachedPinnedContent)
                : [];
        }

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
        initialValue: cachedPinnedContent || [],
        deep: true,
    },
);

watch(
    pinnedCategoryContent as any,
    async (value) => {
        // Only save if we have data AND dependencies are ready
        // Don't save empty arrays when dependencies aren't ready
        if (
            value &&
            value.length > 0 &&
            appLanguageIdsAsRef.value.length > 0 &&
            pinnedCategories.value.length > 0
        ) {
            try {
                await db.setQueryCache<ContentDto[]>("homepage_pinnedContent", value);
            } catch (error) {
                console.warn("Failed to save pinned content cache:", error);
            }
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
