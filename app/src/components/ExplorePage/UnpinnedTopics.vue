<script setup lang="ts">
import { TagType } from "luminary-shared";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// Seek by parentTagType via the parentTagType-led index; the publishDate sort is
// required to engage it (order is irrelevant — contentByTag re-sorts downstream).
const topics = useContentQuery(
    () => [{ parentTagType: TagType.Topic }, { parentTaggedDocs: { $exists: true, $ne: [] } }],
    {
        cache: true,
        useIndex: "content-parentTagType-publishDate-index",
        sort: [{ publishDate: "desc" }],
    },
);

const categories = useContentQuery(
    () => [
        { parentTagType: TagType.Category },
        { $or: [{ parentPinned: { $exists: false } }, { parentPinned: { $ne: 1 } }] },
    ],
    {
        cache: true,
        useIndex: "content-parentTagType-publishDate-index",
        sort: [{ publishDate: "desc" }],
    },
);

const topicsByCategory = contentByTag(topics, categories, { includeUntagged: true });
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
        class="pb-1"
        :class="index == 0 ? 'pt-4' : 'pt-2'"
    />
    <HorizontalContentTileCollection
        v-if="topicsByCategory.untagged.value.length"
        :contentDocs="topicsByCategory.untagged.value"
        :title="t('explore.other')"
        aspectRatio="classic"
        contentTitlePosition="center"
        class="pb-1 pt-2"
    />
</template>
