<script setup lang="ts">
import { ref, onMounted, onUnmounted, inject } from "vue";
import { MediaPlayerKey } from "@/build-time/contracts/media-player/token";

const props = defineProps<{
    src: string | undefined;
}>();

const mediaPlayerService = inject(MediaPlayerKey);
if (!mediaPlayerService) {
    throw new Error("MediaPlayerService not provided");
}

const audioRef = ref<HTMLAudioElement | null>(null);

onMounted(() => {
    const el = audioRef.value;
    if (el) mediaPlayerService.attachAudioElement(el);
});

onUnmounted(() => {
    const el = audioRef.value;
    if (el) mediaPlayerService.detachAudioElement(el);
});

defineExpose({
    getAudioElement: () => audioRef.value,
});
</script>

<template>
    <audio
        ref="audioRef"
        :src="props.src"
        preload="auto"
        class="hidden"
    />
</template>
