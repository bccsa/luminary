<script setup lang="ts">
import UnpinnedTopics from "@/components/ExplorePage/UnpinnedTopics.vue";
import PinnedTopics from "@/components/ExplorePage/PinnedTopics.vue";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
</script>

<template>
    <IgnorePagePadding ignoreTop>
        <Suspense>
            <PinnedTopics />
        </Suspense>
        <Suspense>
            <UnpinnedTopics />
        </Suspense>
    </IgnorePagePadding>
</template>
