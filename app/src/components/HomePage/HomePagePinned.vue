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
    mangoToDexie,
} from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { mangoIsPublished } from "@/util/mangoIsPublished";

const pinnedCategories = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) => {
        // Build query inside callback so it uses current appLanguageIds
        const query = mangoToDexie(db.docs, {
            selector: {
                $and: [
                    { type: DocType.Content },
                    { parentPinned: 1 }, // 1 = true
                    ...mangoIsPublished(appLanguageIds),
                ],
            },
        });
        return query.toArray() as unknown as Promise<ContentDto[]>;
    },
    { initialValue: await db.getQueryCache<ContentDto[]>("homepage_pinnedCategories"), deep: true },
);

watch(pinnedCategories as any, async (value) => {
    db.setQueryCache<ContentDto[]>("homepage_pinnedCategories", value);
});

const pinnedCategoryContent = useDexieLiveQueryWithDeps(
    [appLanguageIdsAsRef, pinnedCategories],
    ([appLanguageIds, pinnedCategories]: [Uuid[], ContentDto[]]) => {
        // Build query inside callback so it uses current values
        const query = mangoToDexie(db.docs, {
            selector: {
                $and: [
                    { type: DocType.Content },
                    { parentPostType: { $ne: PostType.Page } },
                    { $or: [{ parentTagType: { $exists: false } }, { parentTagType: TagType.Topic }] },
                    { parentTags: { $elemMatch: { $in: pinnedCategories.map((c) => c.parentId) } } },
                    ...mangoIsPublished(appLanguageIds),
                ],
            },
        });
        return query.toArray() as unknown as Promise<ContentDto[]>;
    },
    { initialValue: await db.getQueryCache<ContentDto[]>("homepage_pinnedContent") },
);

watch(pinnedCategoryContent as any, async (value) => {
    db.setQueryCache<ContentDto[]>("homepage_pinnedContent", value);
});

// sort pinned content by category
const pinnedContentByCategory = contentByTag(pinnedCategoryContent as any, pinnedCategories as any);
</script>

<template>
    <HorizontalContentTileCollection v-for="(c, index) in pinnedContentByCategory.tagged.value" :key="c.tag._id"
        :contentDocs="c.content" :title="c.tag.title" :summary="c.tag.summary" :showPublishDate="false"
        class="bg-yellow-500/10 pb-1 dark:bg-yellow-500/5" :class="[
            index == 0 ? 'pt-4' : 'pt-2',
            index == pinnedContentByCategory.tagged.value.length - 1 ? 'pb-3' : '',
        ]" />
</template>
