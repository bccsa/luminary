<script setup lang="ts">
import { PostType, TagType } from "luminary-shared";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { useContentQuery } from "@/composables/useContentQuery";

const pinnedCategories = useContentQuery(() => [{ parentPinned: 1 }], {
    cache: true,
    // Seek pinned category docs via the parentPinned-led index. Order is irrelevant
    // here (contentByTag re-sorts downstream), but the publishDate sort is required
    // for CouchDB to engage the index instead of full-scanning the content collection.
    useIndex: "content-parentPinned-publishDate-index",
    sort: [{ publishDate: "desc" }],
});

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
    // parentTags $elemMatch can't use a sorted Mango index, so the API supplement scans
    // the older tail. Cap at the newest 50 (sort makes the cap deterministic) so the
    // limit-shortfall branch skips the API POST once local Dexie already holds 50
    // matches. contentByTag re-sorts per category downstream, so this sort only governs
    // which 50 are fetched, not display order.
    { cache: true, limit: 50, sort: [{ publishDate: "desc" }] },
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
        :useVerticalTileLayout="c.tag.parentUseVerticalTileLayout"
        class="bg-yellow-500/10 pb-1 dark:bg-yellow-500/5"
        :class="[
            index == 0 ? 'pt-4' : 'pt-2',
            index == pinnedContentByCategory.tagged.value.length - 1 ? 'pb-3' : '',
        ]"
    />
</template>
