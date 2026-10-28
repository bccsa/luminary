<script setup lang="ts">
/**
 * What a content page offers when the content has media: one Play button. On the page's picture it is a round
 * button half over the picture's bottom-right edge, clear of the title and summary over the picture's foot;
 * without a picture it sits under the title. Media is an attachment of the post, not the post, so the page looks
 * the same with or without it; pressing it opens the app-wide media player, which does the playing, and where
 * sound and picture are switched.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { ContentDto } from "luminary-shared";
import { getMediaDuration, getMediaProgress } from "@/contentProgress";
import { videoSourceFor } from "@/util/videoSource";
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

/** How far the video was watched, 0–100; 0 until it has been started. */
const watched = computed(() => {
    const source = videoSourceFor(props.content);
    if (!source) return 0;
    const progress = getMediaProgress(source, props.content._id);
    const duration = getMediaDuration(source, props.content._id);
    return progress > 0 && duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
});
</script>

<template>
    <!-- The border is the page's own background, so the button reads as cut out of the picture's edge. -->
    <button
        v-if="corner"
        type="button"
        class="absolute -bottom-[34px] right-3.5 flex h-[68px] w-[68px] items-center justify-center rounded-full bg-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500 dark:bg-slate-900 lg:-bottom-[42px] lg:right-6 lg:h-[84px] lg:w-[84px]"
        :aria-label="t('media_player.play')"
        data-test="mediaPlay"
        @click.stop="open"
    >
        <svg
            v-if="watched > 0"
            viewBox="0 0 68 68"
            class="absolute inset-0 h-full w-full -rotate-90"
            aria-hidden="true"
            data-test="mediaPlayProgress"
        >
            <circle
                cx="34"
                cy="34"
                r="31"
                fill="none"
                stroke-width="5"
                class="stroke-zinc-200 dark:stroke-slate-700"
            />
            <circle
                cx="34"
                cy="34"
                r="31"
                fill="none"
                stroke-width="5"
                stroke-linecap="round"
                pathLength="100"
                :stroke-dasharray="`${watched} 100`"
                class="stroke-yellow-700"
            />
        </svg>
        <span
            class="relative flex items-center justify-center rounded-full bg-yellow-500 text-zinc-900"
            :class="
                watched > 0
                    ? 'h-[52px] w-[52px] lg:h-16 lg:w-16'
                    : 'h-[58px] w-[58px] lg:h-[72px] lg:w-[72px]'
            "
        >
            <!-- The triangle's weight sits left of its box: moved right so it looks centred. -->
            <PlayerIcon
                name="play"
                class="h-6 w-6 translate-x-[8%] lg:h-8 lg:w-8"
            />
        </span>
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
