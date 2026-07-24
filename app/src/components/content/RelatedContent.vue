<script setup lang="ts">
import { TagType, type ContentDto } from "luminary-shared";
import { computed } from "vue";
import LazyMount from "../common/LazyMount.vue";
import RelatedFeed from "./RelatedFeed.vue";

type Props = {
    tags: ContentDto[];
    selectedContent: ContentDto;
};
const props = defineProps<Props>();

// Topic pages already list their own content, so the "Read more" block is for non-topics.
const isNotTopic = computed(() => props.selectedContent.parentTagType !== TagType.Topic);
</script>

<template>
    <LazyMount v-if="isNotTopic">
        <RelatedFeed
            :selected-content="selectedContent"
            :tags="tags"
        />
    </LazyMount>
</template>
