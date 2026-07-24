<script setup lang="ts">
import { type ContentDto } from "luminary-shared";
import { useI18n } from "vue-i18n";
import { useRelatedFeed } from "@/composables/useRelatedFeed";
import ReadMore from "./ReadMore.vue";

const props = defineProps<{
    selectedContent: ContentDto;
    tags: ContentDto[];
}>();

const { t } = useI18n();

// One merged, capped "Read more" feed: series neighbours first, then topical/author/
// cross-topic-affinity content fills the rest (see useRelatedFeed for the priority order).
const { items } = useRelatedFeed(
    () => props.selectedContent,
    () => props.tags,
);
</script>

<template>
    <section
        v-if="items.length"
        class="w-full pb-2"
    >
        <h2
            class="flex items-baseline gap-2 px-4 pb-3 text-xl text-zinc-800 dark:text-zinc-200 sm:px-8"
        >
            <span
                class="h-4 w-1 shrink-0 self-center rounded-l-full bg-yellow-400/50"
                aria-hidden="true"
            ></span>
            <span class="truncate">{{ t("content.read_more") }}</span>
        </h2>
        <ReadMore :items="items" />
    </section>
</template>
