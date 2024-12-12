<script setup lang="ts">
import AllTopics from "@/components/ExplorePage/AllTopics.vue";
import ExplorePinnedTopics from "@/components/ExplorePage/ExplorePinnedTopics.vue";
</script>

<template>
    <Suspense>
        <ExplorePinnedTopics />
    </Suspense>
    <Suspense>
        <AllTopics />
    </Suspense>
</template>
