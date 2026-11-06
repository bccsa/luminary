<script setup lang="ts">
/**
 * What a content page offers when the content has media: one Play button. On the page's picture it is a round
 * button half over the picture's bottom-right edge, clear of the title and summary over the picture's foot;
 * without a picture it sits under the title. Media is an attachment of the post, not the post, so the page looks
 * the same with or without it; pressing it opens the app-wide media player, which does the playing, and where
 * sound and picture are switched.
 */
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import type { ContentDto } from "luminary-shared";
import { getMediaDuration, getMediaProgress } from "@/contentProgress";
import { mediaSourceFor } from "@/util/mediaSource";
import { openMediaPlayer } from "./mediaPlayer";
import PlayerIcon from "./PlayerIcon.vue";

const props = defineProps<{
    content: ContentDto;
    language: string | null | undefined;
    /** On the edge of the page's picture rather than under the title. */
    corner?: boolean;
}>();

const { t } = useI18n();

const open = () => openMediaPlayer(props.content, props.language);

/** Set from pointer events because iOS WebKit gives a touch no `:active` without a touch listener. */
const pressed = ref(false);

/** The ring's colours: tones of the icon's dark on the yellow, the same on either theme. */
const ringTrackClass = "stroke-zinc-900/[0.12]";
const ringProgressFromClass = "[stop-color:theme(colors.zinc.900)] [stop-opacity:0.45]";
const ringProgressToClass = "[stop-color:theme(colors.zinc.900)] [stop-opacity:0.8]";
const ringGradientId = `media-play-ring-${useId()}`;

/** How far the media was played, 0–100; 0 until it has been started. */
const mediaProgress = computed(() => {
    const source = mediaSourceFor(props.content);
    if (!source) return 0;
    const progress = getMediaProgress(source, props.content._id);
    const duration = getMediaDuration(source, props.content._id);
    return progress > 0 && duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
});
</script>

<template>
    <button
        v-if="corner"
        type="button"
        class="absolute -bottom-[34px] right-3.5 flex h-[68px] w-[68px] items-center justify-center rounded-full shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500 motion-safe:transition-transform lg:-bottom-[42px] lg:right-6 lg:h-[84px] lg:w-[84px]"
        :class="
            pressed
                ? 'motion-safe:scale-[0.92] motion-safe:duration-75 motion-safe:ease-out'
                : 'motion-safe:duration-[120ms] motion-safe:ease-[cubic-bezier(0.2,0.9,0.3,1)]'
        "
        :aria-label="t('media_player.play')"
        data-test="mediaPlay"
        @pointerdown="pressed = true"
        @pointerup="pressed = false"
        @pointercancel="pressed = false"
        @pointerleave="pressed = false"
        @click.stop="open"
    >
        <!-- One SVG for disc, track and progress: no seam or border between them, and vector edges at any scale. -->
        <svg
            viewBox="0 0 68 68"
            class="absolute inset-0 h-full w-full"
            shape-rendering="geometricPrecision"
            aria-hidden="true"
            data-test="mediaPlayProgress"
        >
            <!-- Static: painted with the arc, which changes only by its dash length. -->
            <defs>
                <!-- In the arc's own, unrotated space: from its start at the top to the bottom. -->
                <linearGradient
                    :id="ringGradientId"
                    data-test="mediaPlayGradient"
                    gradientUnits="userSpaceOnUse"
                    x1="68"
                    y1="34"
                    x2="0"
                    y2="34"
                >
                    <stop
                        offset="0"
                        :class="ringProgressFromClass"
                    />
                    <stop
                        offset="1"
                        :class="ringProgressToClass"
                    />
                </linearGradient>
            </defs>
            <!-- The ring lies on the disc, inset from its edge, so it never reads as a border. -->
            <circle
                cx="34"
                cy="34"
                r="34"
                class="fill-yellow-500"
                data-test="mediaPlayDisc"
            />
            <!-- Shown before the video is started too, so the ring is always there. -->
            <circle
                cx="34"
                cy="34"
                r="30.5"
                fill="none"
                stroke-width="3"
                :class="ringTrackClass"
                data-test="mediaPlayTrack"
            />
            <!-- A round-capped dash of length 0 still draws a dot. -->
            <circle
                v-if="mediaProgress > 0"
                cx="34"
                cy="34"
                r="30.5"
                fill="none"
                stroke-width="3"
                stroke-linecap="round"
                pathLength="100"
                transform="rotate(-90 34 34)"
                :stroke-dasharray="`${mediaProgress} 100`"
                :stroke="`url(#${ringGradientId})`"
                data-test="mediaPlayProgressArc"
            />
        </svg>
        <!-- The triangle's weight sits left of its box: moved right so it looks centred. -->
        <PlayerIcon
            name="play"
            class="relative h-6 w-6 translate-x-[8%] text-zinc-900 lg:h-8 lg:w-8"
        />
    </button>
    <div
        v-else
        class="mt-4 flex justify-center px-4"
    >
        <button
            type="button"
            class="flex h-11 items-center gap-2 rounded-full bg-yellow-500 px-5 text-base font-semibold text-zinc-900 shadow-sm hover:bg-yellow-400"
            data-test="mediaPlay"
            @click="open"
        >
            <PlayerIcon
                name="play"
                class="h-5 w-5 translate-x-[8%]"
            />
            {{ t("media_player.play") }}
        </button>
    </div>
</template>
