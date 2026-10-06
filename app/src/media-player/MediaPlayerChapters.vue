<script setup lang="ts">
/** The chapters of what plays: tap one to go there. The one the playhead is in is marked. */
import { computed } from "vue";
import type { Chapter } from "@luminary-media-converter/player-web";

const props = defineProps<{ chapters: Chapter[]; currentTime: number }>();
defineEmits<{ select: [chapter: Chapter] }>();

/** `m:ss`, or `h:mm:ss` past an hour. */
function formatTime(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds));
    const h = Math.floor(whole / 3600);
    const m = Math.floor((whole % 3600) / 60);
    const s = String(whole % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const current = computed(() =>
    props.chapters.findIndex(
        (chapter) => props.currentTime >= chapter.startTime && props.currentTime < chapter.endTime,
    ),
);
</script>

<template>
    <ol
        class="flex-1 divide-y divide-zinc-200/70 overflow-y-auto px-4 pb-8 dark:divide-slate-700/70"
    >
        <li
            v-for="(chapter, index) in chapters"
            :key="`${chapter.startTime}-${index}`"
        >
            <button
                type="button"
                class="flex w-full items-center gap-4 py-3 text-left"
                :aria-current="index === current ? 'true' : undefined"
                data-test="mediaPlayerChapter"
                @click="$emit('select', chapter)"
            >
                <span
                    class="w-14 flex-shrink-0 text-sm tabular-nums text-zinc-500 dark:text-slate-400"
                    >{{ formatTime(chapter.startTime) }}</span
                >
                <span
                    class="min-w-0 flex-1 text-sm"
                    :class="
                        index === current
                            ? 'font-bold text-yellow-700 dark:text-yellow-400'
                            : 'font-semibold text-zinc-700 dark:text-slate-200'
                    "
                    >{{ chapter.title }}</span
                >
            </button>
        </li>
    </ol>
</template>
