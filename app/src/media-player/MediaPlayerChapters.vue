<script setup lang="ts">
/** The chapters of what plays: tap one to go there. The one the playhead is in is marked. */
import { computed } from "vue";
import { chapterIndexAt } from "./playerCompat";
import type { Chapter, ThumbnailSpriteCue } from "./playerCompat";
import ChapterRow from "./ChapterRow.vue";
import { chapterProgress } from "./chapterProgress";

const props = defineProps<{
    chapters: Chapter[];
    currentTime: number;
    /** A frame of the video at a time, for the rows to lead with; without it the rows are text. */
    cueAt?: (time: number) => ThumbnailSpriteCue | null;
}>();
defineEmits<{ select: [chapter: Chapter] }>();

const current = computed(() => chapterIndexAt(props.chapters, props.currentTime));
</script>

<template>
    <ol class="flex-1 space-y-1 overflow-y-auto px-3 pb-8 pt-2">
        <li
            v-for="(chapter, index) in chapters"
            :key="`${chapter.startTime}-${index}`"
        >
            <ChapterRow
                :chapter="chapter"
                :current="index === current"
                :cue="cueAt?.(chapter.startTime) ?? null"
                :progress="chapterProgress(chapter, currentTime)"
                @click="$emit('select', chapter)"
            />
        </li>
    </ol>
</template>
