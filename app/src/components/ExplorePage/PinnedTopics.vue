<script setup lang="ts">
import { DocType, TagType } from "luminary-shared";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { contentByTag } from "../contentByTag";
import { useContentQuery } from "@/composables/useContentQuery";

const categories = useContentQuery(
    () => [{ parentPinned: 1 }, { parentTagType: TagType.Category }],
    {
        cache: true,
        // Seek via the parentPinned-led index; publishDate sort required to engage it
        // (order is irrelevant — contentByTag re-sorts downstream).
        useIndex: "content-parentPinned-publishDate-index",
        sort: [{ publishDate: "desc" }],
    },
);

// Reads categories.value inside the thunk so this query auto-rebuilds when the
// pinned categories change.
const topics = useContentQuery(
    () => [
        { parentType: DocType.Tag },
        { $or: [{ parentTagType: { $exists: false } }, { parentTagType: TagType.Topic }] },
        { parentId: { $in: categories.value.flatMap((p) => p.parentTaggedDocs ?? []) } },
    ],
    // Resolve each pinned category to the post ids tagged with it (parentTaggedDocs — the
    // server-mirrored copy of the tag's taggedDocs) and seek child content by parentId.
    // This indexes the local Dexie read and lets the API older-tail supplement fan out to
    // per-parent index seeks when the combined parentId set is within the fan-out cap.
    // Featured content can predate the sync cutoff, so the supplement is REQUIRED to surface
    // it (it is not in the local window); when the combined set exceeds the cap the
    // supplement falls back to a content-partition scan. sort+limit bound the window;
    // contentByTag re-sorts per category for display.
    { cache: true, limit: 50, sort: [{ publishDate: "desc" }] },
);

// sort pinned content by category
const topicsByCategory = contentByTag(topics, categories);
</script>

<template>
    <HorizontalContentTileCollection
        v-for="(c, index) in topicsByCategory.tagged.value"
        :key="c.tag._id"
        :contentDocs="c.content"
        :title="c.tag.title"
        aspectRatio="classic"
        contentTitlePosition="center"
        :summary="c.tag.summary"
        :showPublishDate="false"
        class="bg-yellow-500/10 pb-1 dark:bg-yellow-500/5"
        :class="[
            index == 0 ? 'pt-4' : 'pt-2',
            index == topicsByCategory.tagged.value.length - 1 ? 'pb-4' : '',
        ]"
    />
</template>
