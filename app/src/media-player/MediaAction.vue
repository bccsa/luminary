<script setup lang="ts">
/**
 * What a content page offers when the content has media: one Play button. On the page's picture it is a round
 * button half over the picture's bottom-right edge, clear of the title and summary over the picture's foot;
 * without a picture it sits under the title. Media is an attachment of the post, not the post, so the page looks
 * the same with or without it; pressing it opens the app-wide media player, which does the playing, and where
 * sound and picture are switched.
 */
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import type { ContentDto } from "luminary-shared";
import { getMediaDuration, getMediaProgress } from "@/contentProgress";
import { mediaSourceFor } from "@/util/mediaSource";
import { openMediaPlayer } from "./mediaPlayer";
import PlayerIcon from "./PlayerIcon.vue";
import { PLAYER_ICONS } from "./playerIcons";

const props = defineProps<{
    content: ContentDto;
    language: string | null | undefined;
    /** On the edge of the page's picture rather than under the title. */
    corner?: boolean;
}>();

const { t } = useI18n();

const open = () => openMediaPlayer(props.content, props.language);

const PLAY_PATH = PLAYER_ICONS.play[0]!.path;
/** Filter ids are page-wide: each button names its own, the same in the prerender and the page. */
const uid = useId();

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
        @click.stop="open"
    >
        <!-- One vector drawing, so it stays sharp at any pixel ratio: no CSS filter, transform or box shadow
             to be rasterised. The ring shows before the video is started too. It lies on a photo of any
             brightness, so it has a halo: soft on the light page, where a strong one reads as a black band. -->
        <svg
            viewBox="0 0 68 68"
            class="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden="true"
            data-test="mediaPlayProgress"
        >
            <defs>
                <filter
                    :id="`${uid}-halo`"
                    x="-20%"
                    y="-20%"
                    width="140%"
                    height="140%"
                >
                    <feGaussianBlur stdDeviation="1.5" />
                </filter>
                <filter
                    :id="`${uid}-shadow`"
                    x="-30%"
                    y="-30%"
                    width="160%"
                    height="160%"
                >
                    <feDropShadow
                        dx="0"
                        dy="2"
                        stdDeviation="3"
                        flood-color="#000"
                        flood-opacity="0.3"
                    />
                </filter>
            </defs>
            <circle
                cx="34"
                cy="34"
                r="31"
                fill="none"
                stroke-width="6"
                :filter="`url(#${uid}-halo)`"
                class="stroke-black/25 dark:stroke-black/60"
            />
            <circle
                cx="34"
                cy="34"
                r="31"
                fill="none"
                stroke-width="5"
                class="stroke-zinc-200 dark:stroke-slate-700"
                data-test="mediaPlayTrack"
            />
            <!-- From the top, clockwise. A round-capped dash of length 0 still draws a dot. -->
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
                transform="rotate(-90 34 34)"
                class="stroke-yellow-600 dark:stroke-yellow-700"
                data-test="mediaPlayArc"
            />
            <!-- The disc and its outline fill the ring's inner edge (radius 28.5), so no gap shows between them. -->
            <g data-test="mediaPlayDisc">
                <circle
                    cx="34"
                    cy="34"
                    r="28.5"
                    :filter="`url(#${uid}-shadow)`"
                    class="fill-zinc-900"
                    data-test="mediaPlayOutline"
                />
                <circle
                    cx="34"
                    cy="34"
                    r="25.5"
                    class="fill-yellow-500"
                />
                <!-- The play glyph (18-unit grid) at 4/3, centred by the circle that encloses it (centre 7.43, 9 on its
                     grid), so it sits in the middle of the disc as a round shape would, not by its box. -->
                <path
                    :d="PLAY_PATH"
                    transform="translate(24.093 22) scale(1.33333)"
                    class="fill-zinc-900"
                />
            </g>
        </svg>
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
