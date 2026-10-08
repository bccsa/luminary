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
    <ol class="flex-1 space-y-1 overflow-y-auto px-3 pb-8 pt-2">
        <li
            v-for="(chapter, index) in chapters"
            :key="`${chapter.startTime}-${index}`"
        >
            <button
                type="button"
                class="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left"
                :class="
                    index === current
                        ? 'bg-yellow-500/15 dark:bg-yellow-400/15'
                        : 'hover:bg-zinc-100 dark:hover:bg-slate-800'
                "
                :aria-current="index === current ? 'true' : undefined"
                data-test="mediaPlayerChapter"
                @click="$emit('select', chapter)"
            >
                <!-- Three bars, as the audio players mark what plays now. -->
                <svg
                    v-if="index === current"
                    class="h-4 w-4 flex-shrink-0 text-yellow-600 dark:text-yellow-400"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                    data-test="mediaPlayerChapterNow"
                >
                    <rect
                        x="1.5"
                        y="7"
                        width="3"
                        height="8"
                        rx="1.5"
                    />
                    <rect
                        x="6.5"
                        y="2"
                        width="3"
                        height="13"
                        rx="1.5"
                    />
                    <rect
                        x="11.5"
                        y="5"
                        width="3"
                        height="10"
                        rx="1.5"
                    />
                </svg>
                <span
                    class="min-w-0 flex-1 text-[15px] leading-snug"
                    :class="
                        index === current
                            ? 'font-bold text-zinc-900 dark:text-white'
                            : 'text-zinc-800 dark:text-slate-200'
                    "
                    >{{ chapter.title }}</span
                >
                <span
                    class="flex-shrink-0 text-sm tabular-nums"
                    :class="
                        index === current
                            ? 'font-semibold text-yellow-700 dark:text-yellow-400'
                            : 'text-zinc-500 dark:text-slate-400'
                    "
                    >{{ formatTime(chapter.startTime) }}</span
                >
            </button>
        </li>
    </ol>
</template>
