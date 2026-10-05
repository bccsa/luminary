<script setup lang="ts">
/**
 * A content page's player area: the poster and the web player's play button. Play opens the
 * app-wide media player, which does the playing.
 */
import { useI18n } from "vue-i18n";
import type { ContentDto } from "luminary-shared";
import LImage from "@/components/images/LImage.vue";
import { openMediaPlayer } from "./mediaPlayer";

const props = defineProps<{
    content: ContentDto;
    language: string | null | undefined;
}>();

const { t } = useI18n();
</script>

<template>
    <div class="relative bg-transparent md:rounded-lg">
        <LImage
            :image="content.parentImageData"
            aspectRatio="video"
            size="post"
            :content-parent-id="content.parentId"
            :parent-image-bucket-id="content.parentImageBucketId"
        />
        <button
            type="button"
            class="absolute left-1/2 top-1/2 flex h-[49px] w-[90px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[9px] bg-zinc-800/60 text-white"
            :aria-label="t('media_player.play')"
            data-test="mediaPosterPlay"
            @click="openMediaPlayer(props.content, props.language)"
        >
            <span
                class="vjs-icon-play text-[48px] leading-none"
                aria-hidden="true"
            />
        </button>
    </div>
</template>
