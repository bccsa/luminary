<script setup lang="ts">
/**
 * What a content page offers when the content has media: one Play button. On the page's picture it is a round button
 * in its top-right corner, clear of the title and summary over the picture's foot; without a picture it sits under
 * the title. Media is an attachment of the post, not the post, so the page looks the same with or without it;
 * pressing it opens the app-wide media player, which does the playing, and where sound and picture are switched.
 */
import { useI18n } from "vue-i18n";
import { PlayIcon } from "@heroicons/vue/20/solid";
import type { ContentDto } from "luminary-shared";
import { openMediaPlayer } from "./mediaPlayer";

const props = defineProps<{
    content: ContentDto;
    language: string | null | undefined;
    /** In the corner of the page's picture rather than under the title. */
    corner?: boolean;
}>();

const { t } = useI18n();

const open = () => openMediaPlayer(props.content, props.language);
</script>

<template>
    <button
        v-if="corner"
        type="button"
        class="absolute right-3 top-3 flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/70 backdrop-blur-sm hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:right-4 lg:top-4 lg:h-14 lg:w-14"
        :aria-label="t('media_player.play')"
        data-test="mediaPlay"
        @click.stop="open"
    >
        <!-- The triangle's weight sits left of its box: moved right so it looks centred. -->
        <PlayIcon class="h-6 w-6 translate-x-[8%] lg:h-7 lg:w-7" />
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
            <PlayIcon class="h-5 w-5 translate-x-[8%]" />
            {{ t("media_player.play") }}
        </button>
    </div>
</template>
