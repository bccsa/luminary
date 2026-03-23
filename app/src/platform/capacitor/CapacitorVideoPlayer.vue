<script setup lang="ts">
import type { ContentDto } from "luminary-shared";

/**
 * Capacitor-native video player stub.
 *
 * This component is a placeholder for the native implementation.
 * It accepts the same props as WebVideoPlayer so the interface contract
 * is satisfied from day one.
 *
 * Replace this body with a real Capacitor media player integration
 * (e.g. capacitor-community/video-player or a custom native plugin)
 * when the Capacitor shell is introduced.
 */
type Props = {
    content: ContentDto;
    language: string | null | undefined;
};

defineProps<Props>();
</script>

<template>
    <div
        class="flex aspect-video items-center justify-center rounded-lg bg-zinc-900 text-zinc-400"
    >
        <p class="text-sm">Native player — coming soon</p>
    </div>
</template>
