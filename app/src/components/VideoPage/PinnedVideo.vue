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
        initialValue: await db.getQueryCache<ContentDto[]>("videopage_pinnedCategories"),
        deep: true,
    },
);

watch(pinnedCategories, async (value) => {
    db.setQueryCache<ContentDto[]>("videopage_pinnedCategories", value);
});

const pinnedCategoryContent = useDexieLiveQueryWithDeps(
    [appLanguageIdsAsRef, pinnedCategories],
    ([appLanguageIds, pinnedCategories]: [Uuid[], ContentDto[]]) => {
        return mangoToDexie<ContentDto>(db.docs, {
            selector: {
                $and: [
                    { type: DocType.Content },
                    { video: { $exists: true, $ne: "" } },
                    { parentPostType: { $ne: PostType.Page } },
                    { $or: [{ parentTagType: { $exists: false } }, { parentTagType: TagType.Topic }] },
                    {
                        parentTags: {
                            $elemMatch: { $in: pinnedCategories.map((c) => c.parentId) },
                        },
                    },
                    ...mangoIsPublished(appLanguageIds),
                ],
            },
        });
    },
    { initialValue: await db.getQueryCache<ContentDto[]>("videopage_pinnedContent") },
);

watch(pinnedCategoryContent, async (value) => {
    db.setQueryCache<ContentDto[]>("videopage_pinnedContent", value);
});

// sort pinned content by category
const pinnedContentByCategory = contentByTag(pinnedCategoryContent, pinnedCategories);
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
