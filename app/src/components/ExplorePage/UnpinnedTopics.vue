<script setup lang="ts">
import { TagType } from "luminary-shared";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const topics = useContentQuery(
    () => [{ parentTagType: TagType.Topic }, { parentTaggedDocs: { $exists: true, $ne: [] } }],
    { cache: true },
);

const categories = useContentQuery(
    () => [
        { parentTagType: TagType.Category },
        { $or: [{ parentPinned: { $exists: false } }, { parentPinned: { $ne: 1 } }] },
    ],
    { cache: true },
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
