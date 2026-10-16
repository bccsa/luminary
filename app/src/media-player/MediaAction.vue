<script setup lang="ts">
/**
 * What a content page offers when the content has media: one button under the picture. Media is an
 * attachment of the post, not the post, so the page looks the same with or without it; pressing
 * this opens the app-wide media player, which does the playing.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { MusicalNoteIcon, PlayIcon } from "@heroicons/vue/20/solid";
import type { ContentDto } from "luminary-shared";
import { openMediaPlayer, startsAsAudio } from "./mediaPlayer";

const props = defineProps<{
    content: ContentDto;
    language: string | null | undefined;
}>();

const { t } = useI18n();
/** Data Saver starts the sound only, so the button promises what will happen. */
const listen = computed(() => startsAsAudio.value);
</script>

<template>
    <div class="mt-4 flex justify-center px-4">
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
