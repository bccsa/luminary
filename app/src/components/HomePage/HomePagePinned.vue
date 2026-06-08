<script setup lang="ts">
import { PostType, TagType } from "luminary-shared";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { useContentQuery } from "@/composables/useContentQuery";

const pinnedCategories = useContentQuery(() => [{ parentPinned: 1 }], { cache: true });

// Reads pinnedCategories.value inside the thunk so this query auto-rebuilds when
// the pinned categories change.
const pinnedCategoryContent = useContentQuery(
    () => [
        {
            $or: [
                { parentPostType: { $exists: false } },
                { parentPostType: { $ne: PostType.Page } },
            ],
        },
        {
            $or: [{ parentTagType: { $exists: false } }, { parentTagType: TagType.Topic }],
        },
        {
            parentTags: { $elemMatch: { $in: pinnedCategories.value.map((c) => c.parentId) } },
        },
    ],
    { cache: true },
);

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
