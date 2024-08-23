<script setup lang="ts">
// Helper component to load multiple HorizontalScrollableTagViewer components only after the app langauge is available.
import HorizontalScrollableTagViewer from "@/components/tags/HorizontalScrollableTagViewer.vue";
import { db, type queryOptions, type TagType } from "luminary-shared";

type Props = {
    tagType: TagType;
    tagQueryOptions: queryOptions;
    contentQueryOptions: queryOptions;
    showPublishDate?: boolean;
};
const props = defineProps<Props>();

if (!props.tagQueryOptions.languageId) {
    console.error("Language ID is required as an option for tagQueryOptions");
}

const categories = db.tagsWhereTagTypeAsRef(props.tagType, props.tagQueryOptions);
</script>

<template>
    <HorizontalScrollableTagViewer
        v-for="category in categories"
        :key="category._id"
        :tag="category"
        :queryOptions="contentQueryOptions"
        :showPublishDate="!category.pinned"
    />
</template>
