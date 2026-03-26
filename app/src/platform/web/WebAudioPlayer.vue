<script setup lang="ts">
import type { ContentDto } from "luminary-shared";
import AudioPlayer from "@/components/content/AudioPlayer.vue";

type Props = {
    content: ContentDto;
};

defineProps<Props>();
</script>

<template>
    <AudioPlayer v-bind="$attrs" :content="content" />
</template>
