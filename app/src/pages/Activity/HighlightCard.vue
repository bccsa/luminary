<script lang="ts" setup>
import type { ContentDto, HighlightRange } from "luminary-shared";
import { HIGHLIGHT_COLORS } from "@/util/highlightRanges";

defineProps<{
    content: ContentDto;
    range: HighlightRange;
}>();

defineEmits<{ open: [] }>();
</script>

<template>
    <!-- A button rather than a link: the click is handled by the caller, which opens the article
         at the passage. Its children are spans because a button only takes phrasing content. -->
    <button
        type="button"
        class="block w-full cursor-pointer rounded-lg bg-white p-2 text-left shadow ring-1 ring-zinc-950/10 hover:shadow-lg dark:bg-slate-800 dark:ring-white/10"
        data-test="activity-open-highlights"
        @click="$emit('open')"
    >
        <span class="block font-semibold leading-snug text-zinc-800 dark:text-slate-50">
            {{ content.title }}
        </span>
        <!-- Never clamped: the card grows to hold the whole passage. -->
        <span class="mt-2 block break-words text-sm leading-7">
            <mark
                class="bg-transparent box-decoration-clone px-1.5 py-1 text-zinc-800 dark:text-slate-100"
                :style="{ backgroundColor: HIGHLIGHT_COLORS[range.color] }"
                data-test="activity-excerpt"
                >{{ range.text }}</mark
            >
        </span>
    </button>
</template>
