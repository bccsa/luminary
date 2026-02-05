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
    mangoToDexie,
} from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { isPublished } from "@/util/isPublished";
import { mangoIsPublished } from "@/util/mangoIsPublished";

const mangoPinnedCategories = mangoToDexie(db.docs, {
    selector: {
        $and: [
            { type: DocType.Content },
            { parentPinned: 1 }, // 1 = true
            ...mangoIsPublished(appLanguageIdsAsRef.value),
            // ...mangoIsPublished([
            //     "14d07c30-f0a2-4d79-b37b-a957c64859f6",
            //     "lang-eng",
            // ]),
        ],
    },
});

// console.log(pinnedCategoriesTestFunction);

const pinnedCategories = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) =>
        // db.docs
        //     .where({
        //         type: DocType.Content,
        //         parentPinned: 1, // 1 = true
        //     })
        //     .filter((c) => {
        //         return isPublished(c as ContentDto, appLanguageIds);
        //     })
        //     .toArray() as unknown as Promise<ContentDto[]>,
        mangoPinnedCategories.toArray() as unknown as Promise<ContentDto[]>,

    { initialValue: await db.getQueryCache<ContentDto[]>("homepage_pinnedCategories"), deep: true },
);

watch(pinnedCategories as any, async (value) => {
    db.setQueryCache<ContentDto[]>("homepage_pinnedCategories", value);
});

const mangoPinnedCategoryContent = mangoToDexie(db.docs, {
    selector: {
        $and: [
            { type: DocType.Content },
            { parentPostType: { $ne: PostType.Page } },
            { $or: [{ parentTagType: { $exists: false } }, { parentTagType: TagType.Topic }] },
            { parentTags: { $elemMatch: { $in: pinnedCategories.value.map((c) => c.parentId) } } },
            ...mangoIsPublished(appLanguageIdsAsRef.value),
        ],
    },
});

const pinnedCategoryContent = useDexieLiveQueryWithDeps(
    [appLanguageIdsAsRef, pinnedCategories],
    ([appLanguageIds, pinnedCategories]: [Uuid[], ContentDto[]]) =>
        // db.docs
        //     .where({
        //         type: DocType.Content,
        //         status: PublishStatus.Published,
        //     })
        //     .filter((c) => {
        //         const content = c as ContentDto;

        //         if (content.parentPostType && content.parentPostType == PostType.Page) return false;
        //         if (content.parentTagType && content.parentTagType !== TagType.Topic) return false;

        //         for (const tagId of content.parentTags) {
        //             if (
        //                 pinnedCategories.some((p) => p.parentId == tagId) &&
        //                 isPublished(content, appLanguageIds)
        //             )
        //                 return true;
        //         }

        //         return false;
        //     })
        //     .toArray() as unknown as Promise<ContentDto[]>,
        mangoPinnedCategoryContent.toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("homepage_pinnedContent") },
);

watch(pinnedCategoryContent as any, async (value) => {
    db.setQueryCache<ContentDto[]>("homepage_pinnedContent", value);
    console.log(appLanguageIdsAsRef.value);
    console.log(pinnedCategories.value);
    console.log(value);
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
