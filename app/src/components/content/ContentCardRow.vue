<script setup lang="ts">
import { type ContentDto } from "luminary-shared";
import ContentCard from "./ContentCard.vue";

defineProps<{
    items: ContentDto[];
    title: string;
}>();
</script>

<template>
    <!-- Same heading style as the "Read more" section above it (and the home page's row
         headings, e.g. "Newest") — the yellow accent bar is a shared section-heading motif —
         so the two rows read as one design system. Only the item list scrolls horizontally
         instead of stacking, since these supplementary rows are short (a handful of items)
         and don't need Read more's full vertical/grid list or infinite scroll. -->
    <h2
        class="flex items-baseline gap-2 px-4 pb-3 text-xl text-zinc-800 dark:text-zinc-200 sm:px-8"
    >
        <span
            class="h-4 w-1 shrink-0 self-center rounded-l-full bg-yellow-400/50"
            aria-hidden="true"
        ></span>
        <span class="truncate">{{ title }}</span>
    </h2>
    <div
        class="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide sm:gap-4 sm:px-8"
        data-content-tile-scroll
    >
        <ContentCard
            v-for="item in items"
            :key="item._id"
            :data-content-id="item._id"
            :content="item"
        />
    </div>
</template>
