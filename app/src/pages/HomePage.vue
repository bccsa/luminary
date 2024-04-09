<script setup lang="ts">
import HorizontalScrollableTagViewer from "@/components/tags/HorizontalScrollableTagViewer.vue";
import { useTagStore } from "@/stores/tag";
import { TagType } from "@/types";
import { storeToRefs } from "pinia";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";

const tagStore = useTagStore();

const { tagsByTagType } = storeToRefs(tagStore);
</script>

<template>
    <IgnorePagePadding>
        <div class="space-y-2">
            <!-- Display category tags -->
            <HorizontalScrollableTagViewer
                v-for="tag in tagsByTagType(TagType.Category)"
                :key="tag._id"
                :tag="tag"
                :sortOptions="{
                    sortBy: 'publishDate',
                    sortOrder: 'asc',
                }"
            />
        </div>
    </IgnorePagePadding>
</template>
