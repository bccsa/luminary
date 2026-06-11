<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { PostType, TagType } from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const newest10Content = useContentQuery(
    () => [
        {
            $or: [
                { parentPostType: { $exists: false } },
                { parentPostType: { $ne: PostType.Page } },
            ],
        },
        {
            $or: [
                { parentTagType: { $exists: false } },
                { parentTagType: { $ne: TagType.Category } },
            ],
        },
        { parentPublishDateVisible: true },
    ],
    { sort: [{ publishDate: "desc" }], limit: 10, cache: true },
);
</script>

<template>
    <HorizontalContentTileCollection
        :contentDocs="newest10Content"
        :title="t('home.newest')"
        :showPublishDate="true"
        class="pb-1 pt-4"
    />
</template>
