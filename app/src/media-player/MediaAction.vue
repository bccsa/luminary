<script setup lang="ts">
/**
 * What a content page offers when the content has media: Watch and Listen, under the page's picture.
 * Media is an attachment of the post, not the post, so the page looks the same with or without it;
 * either button opens the app-wide media player, which does the playing, with the picture or the sound only.
 */
import { useI18n } from "vue-i18n";
import { MusicalNoteIcon, PlayIcon } from "@heroicons/vue/20/solid";
import type { ContentDto } from "luminary-shared";
import { openMediaPlayer } from "./mediaPlayer";

const props = defineProps<{
    content: ContentDto;
    language: string | null | undefined;
}>();

const { t } = useI18n();

const open = (audio: boolean) => openMediaPlayer(props.content, props.language, { audio });
</script>

<template>
    <div class="mt-4 flex justify-center gap-3 px-4">
        <button
            type="button"
            class="flex h-11 items-center gap-2 rounded-full bg-yellow-500 px-5 text-base font-semibold text-zinc-900 shadow-sm hover:bg-yellow-400"
            data-test="mediaWatch"
            @click="open(false)"
        >
            <!-- The triangle's weight sits left of its box: moved right so it looks centred. -->
            <PlayIcon class="h-5 w-5 translate-x-[8%]" />
            {{ t("media_player.watch") }}
        </button>
        <button
            type="button"
            class="flex h-11 items-center gap-2 rounded-full border border-zinc-300 px-5 text-base font-semibold text-zinc-900 hover:bg-zinc-100 dark:border-slate-500 dark:text-slate-100 dark:hover:bg-slate-700"
            data-test="mediaListen"
            @click="open(true)"
        >
            <MusicalNoteIcon class="h-5 w-5" />
            {{ t("media_player.listen") }}
        </button>
    </div>
</template>
