<script setup lang="ts">
import type { Post, Tag } from "@/types";
import videojs from "video.js";
import { onMounted, ref } from "vue";

type Props = {
    contentParent: Post | Tag;
};

const props = defineProps<Props>();

const playerElement = ref<HTMLVideoElement>();

onMounted(() => {
    let options = {
        fluid: false,
        html5: {
            vhs: {
                overrideNative: true,
            },
            nativeAudioTracks: videojs.browser.IS_SAFARI,
            nativeVideoTracks: videojs.browser.IS_SAFARI,
        },
        autoplay: false,
        preload: "auto",
    };

    const player = videojs(playerElement.value!, options);

    player.poster(props.contentParent.image);
    player.src({ type: "application/x-mpegURL", src: props.contentParent.content[0].video });
});
</script>

<template>
    <div class="aspect-video">
        <video
            ref="playerElement"
            class="video-js h-full w-full rounded shadow-md"
            controls
            preload="auto"
            data-setup="{}"
        ></video>
    </div>
</template>
