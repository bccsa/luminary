<script setup lang="ts">
/**
 * One chapter, as the sheet under the expanded player and the content page both list it: its title,
 * where it starts and how long it runs, and a mark on the one playing now. When the video has a
 * frame for it, the frame leads the row; without one the row is text, so a video encoded without
 * thumbnails reads the same, only plainer.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { Chapter, ThumbnailSpriteCue } from "@luminary-media-converter/player-web-legacy";

const props = withDefaults(
    defineProps<{
        chapter: Chapter;
        /** The chapter the playhead is in. */
        current?: boolean;
        /** A frame of the video at the chapter's start; none draws a text row. */
        cue?: ThumbnailSpriteCue | null;
        /** Width of the frame in px. */
        frameWidth?: number;
        /** How much of the chapter has played, 0 to 1, drawn along the frame's foot; none draws no bar. */
        progress?: number;
        /** Classes for the frame alone, so a page can hide it where it wants text rows. */
        frameClass?: string;
    }>(),
    { current: false, cue: null, frameWidth: 72, frameClass: "" },
);
const { t } = useI18n();

/** `m:ss`, or `h:mm:ss` past an hour. */
function formatTime(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds));
    const h = Math.floor(whole / 3600);
    const m = Math.floor((whole % 3600) / 60);
    const s = String(whole % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Where it starts, and how long it runs in whole minutes, never less than one. */
const meta = computed(() => {
    const minutes = Math.max(1, Math.round((props.chapter.endTime - props.chapter.startTime) / 60));
    return `${formatTime(props.chapter.startTime)} · ${t("media_player.chapter_minutes", { minutes })}`;
});

/**
 * The frame is a crop of a sheet holding many, so it is a window onto the sheet: the element is the
 * crop's own size and scaled to the row's, while the box that clips it is sized after the scale.
 * A cue without a crop is a whole image, which fills the frame.
 */
const whole = computed(() => !props.cue || !props.cue.w || !props.cue.h);
const scale = computed(() => (props.cue && !whole.value ? props.frameWidth / props.cue.w : 1));
const boxStyle = computed(() => {
    const cue = props.cue;
    if (!cue) return {};
    if (whole.value) return { width: `${props.frameWidth}px`, aspectRatio: "16 / 9" };
    return {
        width: `${props.frameWidth}px`,
        height: `${Math.round(cue.h * scale.value)}px`,
    };
});
const imageStyle = computed(() => {
    const cue = props.cue;
    if (!cue) return {};
    if (whole.value) {
        return {
            width: "100%",
            height: "100%",
            backgroundImage: `url("${cue.spriteUrl}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
        };
    }
    return {
        width: `${cue.w}px`,
        height: `${cue.h}px`,
        backgroundImage: `url("${cue.spriteUrl}")`,
        backgroundPosition: `-${cue.x}px -${cue.y}px`,
        backgroundRepeat: "no-repeat",
        transform: `scale(${scale.value})`,
        transformOrigin: "top left",
    };
});
</script>

<template>
    <button
        type="button"
        class="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left"
        :class="
            current
                ? 'bg-yellow-500/15 dark:bg-yellow-400/15'
                : 'hover:bg-zinc-100 dark:hover:bg-slate-800'
        "
        :aria-current="current ? 'true' : undefined"
        data-test="mediaPlayerChapter"
    >
        <span
            v-if="cue"
            class="relative block flex-shrink-0 overflow-hidden rounded-md bg-zinc-900"
            :class="frameClass"
            :style="boxStyle"
            aria-hidden="true"
            data-test="mediaPlayerChapterFrame"
        >
            <span
                class="block"
                :style="imageStyle"
            />
            <span
                v-if="progress !== undefined"
                class="absolute bottom-0 left-0 h-[3px] bg-white"
                :style="{ width: `${Math.round(progress * 100)}%` }"
                data-test="mediaPlayerChapterProgress"
            />
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
                class="line-clamp-2 break-words text-[15px] leading-snug"
                :class="
                    current
                        ? 'font-bold text-yellow-800 dark:text-yellow-300'
                        : 'font-semibold text-zinc-800 dark:text-slate-200'
                "
                >{{ chapter.title }}</span
            >
            <span
                class="truncate text-sm tabular-nums"
                :class="
                    current
                        ? 'text-yellow-800/80 dark:text-yellow-300/80'
                        : 'text-zinc-500 dark:text-slate-400'
                "
                data-test="mediaPlayerChapterTime"
                >{{ meta }}</span
            >
            <!-- Said in words as well as in colour: the row is not the only thing that tells it apart. -->
            <span
                v-if="current"
                class="mt-0.5 self-start rounded-full bg-yellow-800 px-2 text-[11px] font-semibold uppercase leading-5 tracking-wide text-yellow-50 dark:bg-yellow-300 dark:text-yellow-950"
                data-test="mediaPlayerChapterNow"
                >{{ t("media_player.chapter_now") }}</span
            >
        </span>
    </button>
</template>
