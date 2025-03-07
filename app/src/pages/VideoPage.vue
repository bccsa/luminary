<script setup lang="ts">
import PinnedVideo from "@/components/VideoPage/PinnedVideo.vue";
import UnpinnedVideo from "@/components/VideoPage/UnpinnedVideo.vue";
</script>

<template>
    <Suspense>
        <PinnedVideo />
    </Suspense>
    <Suspense>
        <UnpinnedVideo />
    </Suspense>
</template>
