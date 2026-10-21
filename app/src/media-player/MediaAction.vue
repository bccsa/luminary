<script setup lang="ts">
/**
 * What a content page offers when the content has media: one button. On the picture (`onPicture`) it
 * is the play button a video is expected to have; without a picture it sits under the title. Media is
 * an attachment of the post, not the post, so the page looks the same with or without it; pressing
 * this opens the app-wide media player, which does the playing, and where sound and picture are switched.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { MusicalNoteIcon, PlayIcon } from "@heroicons/vue/20/solid";
import type { ContentDto } from "luminary-shared";
import { openMediaPlayer, startsAsAudio } from "./mediaPlayer";

const props = defineProps<{
    content: ContentDto;
    language: string | null | undefined;
    /** Centred over the page's picture instead of under it. */
    onPicture?: boolean;
}>();

const { t } = useI18n();
/** Data Saver starts the sound only, so the button promises what will happen. */
const listen = computed(() => startsAsAudio.value);
</script>

<template>
    <div
        v-if="onPicture"
        class="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
        <button
            type="button"
            class="pointer-events-auto flex h-14 items-center gap-2.5 rounded-full bg-black/55 pl-5 pr-6 text-base font-semibold text-white shadow-lg ring-2 ring-white/80 backdrop-blur-sm hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            data-test="mediaAction"
            @click.stop="openMediaPlayer(props.content, props.language)"
        >
            <MusicalNoteIcon
                v-if="listen"
                class="h-6 w-6"
            />
            <!-- The triangle's weight sits left of its box: moved right so it looks centred. -->
            <PlayIcon
                v-else
                class="h-6 w-6 translate-x-[8%]"
            />
            {{ listen ? t("media_player.listen") : t("media_player.play") }}
        </button>
    </div>
    <div
        v-else
        class="mt-4 flex justify-center px-4"
    >
        <button
            type="button"
            class="flex h-12 items-center gap-2 rounded-full bg-yellow-500 px-6 text-base font-semibold text-zinc-900 shadow-sm hover:bg-yellow-400"
            data-test="mediaAction"
            @click="openMediaPlayer(props.content, props.language)"
        >
            <MusicalNoteIcon
                v-if="listen"
                class="h-5 w-5"
            />
            <PlayIcon
                v-else
                class="h-5 w-5"
            />
            {{ listen ? t("media_player.listen") : t("media_player.watch") }}
        </button>
    </div>
</template>
