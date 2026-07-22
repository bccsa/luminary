<script setup lang="ts">
import { PostType, TagType } from "luminary-shared";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { useContentQuery } from "@/composables/useContentQuery";

const pinnedCategories = useContentQuery(
    () => [{ parentPinned: 1 }, { parentTagType: TagType.Category }],
    {
        cache: true,
        // Seek via the parentPinned-led index; publishDate sort required to engage it
        // (order is irrelevant — contentByTag re-sorts downstream).
        useIndex: "content-parentPinned-publishDate-index",
        sort: [{ publishDate: "desc" }],
    },
);

// Reads pinnedCategories.value inside the thunk so this query auto-rebuilds when
// the pinned categories change.
const pinnedCategoryContent = useContentQuery(
    () => [
        // Only include content that has a video, is not a page, and is either untagged or tagged with a topic.
        { video: { $exists: true, $ne: "" } },
        { video: { $ne: null } },
        {
            $or: [
                { parentPostType: { $exists: false } },
                { parentPostType: { $ne: PostType.Page } },
            ],
        },
        { $or: [{ parentTagType: { $exists: false } }, { parentTagType: TagType.Topic }] },
        { parentId: { $in: pinnedCategories.value.flatMap((c) => c.parentTaggedDocs ?? []) } },
    ],
    // Resolve each pinned category to the post ids tagged with it (parentTaggedDocs — the
    // server-mirrored copy of the tag's taggedDocs) and seek child content by parentId.
    // Featured content can predate the sync cutoff, so the API older-tail supplement is
    // REQUIRED to surface it (it is not in the local window) — see queryIntrospection.ts
    // for how that supplement is built. sort+limit bound the window; contentByTag re-sorts
    // per category for display.
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
        class="bg-yellow-500/10 pb-1 dark:bg-yellow-500/5"
        :class="[
            index == 0 ? 'pt-4' : 'pt-2',
            index == pinnedContentByCategory.tagged.value.length - 1 ? 'pb-3' : '',
        ]"
    />
</template>
