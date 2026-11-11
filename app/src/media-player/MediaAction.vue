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

/** The shadows are SVG filters, which need ids unique on the page. */
const haloId = `lm-play-halo-${useId()}`;
const shadowId = `lm-play-shadow-${useId()}`;

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
        class="absolute -bottom-[34px] right-3.5 flex h-[68px] w-[68px] items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500 lg:-bottom-[42px] lg:right-6 lg:h-[84px] lg:w-[84px]"
        :aria-label="t('media_player.play')"
        data-test="mediaPlay"
        @pointerdown="pressed = true"
        @pointerup="pressed = false"
        @pointercancel="pressed = false"
        @pointerleave="pressed = false"
        @click.stop="open"
    >
        <!-- One SVG for the ring, the disc, its border and the triangle: drawn on one grid, they stay crisp and
             meet exactly on a low-density screen, where separate CSS and SVG layers left soft, uneven edges. -->
        <svg
            viewBox="0 0 68 68"
            class="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden="true"
        >
            <defs>
                <!-- The ring lies on a photo of any brightness, so it is light with a halo: soft on the light
                     page, where a strong one reads as a black band, and strong in dark. -->
                <filter :id="haloId" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow
                        dx="0"
                        dy="0"
                        stdDeviation="0.75"
                        flood-color="#000"
                        class="[flood-opacity:0.25] dark:[flood-opacity:0.6]"
                    />
                </filter>
                <filter :id="shadowId" x="-25%" y="-25%" width="150%" height="150%">
                    <feDropShadow
                        dx="0"
                        dy="2"
                        stdDeviation="3"
                        flood-color="#000"
                        flood-opacity="0.3"
                    />
                </filter>
            </defs>
            <g
                :filter="`url(#${haloId})`"
                transform="rotate(-90 34 34)"
                data-test="mediaPlayProgress"
            >
                <circle
                    cx="34"
                    cy="34"
                    r="31"
                    fill="none"
                    stroke-width="5"
                    class="stroke-zinc-200 dark:stroke-slate-600"
                />
                <!-- A round-capped dash of length 0 still draws a dot. -->
                <circle
                    v-if="mediaProgress > 0"
                    cx="34"
                    cy="34"
                    r="31"
                    fill="none"
                    stroke-width="5"
                    stroke-linecap="round"
                    pathLength="100"
                    :stroke-dasharray="`${mediaProgress} 100`"
                    class="stroke-yellow-500 dark:stroke-yellow-300"
                />
            </g>
            <g
                class="origin-center text-zinc-900 [transform-box:fill-box] motion-safe:transition-transform"
                :class="
                    pressed
                        ? 'motion-safe:scale-[0.92] motion-safe:duration-75 motion-safe:ease-out'
                        : 'motion-safe:duration-[120ms] motion-safe:ease-out'
                "
                data-test="mediaPlayDisc"
            >
                <!-- The yellow disc and its border in one solid colour per theme, so the picture can't show through. -->
                <circle
                    cx="34"
                    cy="34"
                    r="27.5"
                    stroke-width="3"
                    :filter="`url(#${shadowId})`"
                    class="fill-yellow-500 stroke-zinc-600 dark:stroke-slate-950"
                />
                <!-- The triangle's weight sits left of its box: moved right so it looks centred. -->
                <PlayerIcon name="play" x="23.92" y="22" width="24" height="24" />
            </g>
        </svg>
    </button>
    <div v-else class="mt-4 flex justify-center px-4">
        <button
            type="button"
            class="flex h-11 items-center gap-2 rounded-full bg-yellow-500 px-5 text-base font-semibold text-zinc-900 shadow-sm hover:bg-yellow-400"
            data-test="mediaPlay"
            @click="open"
        >
            <PlayerIcon name="play" class="h-5 w-5 translate-x-[8%]" />
            {{ t("media_player.play") }}
        </button>
    </div>
</template>
