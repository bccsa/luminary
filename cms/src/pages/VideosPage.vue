<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";
import { VideoCameraIcon } from "@heroicons/vue/24/outline";
</script>

<template>
    <BasePage title="Videos">
        <EmptyState
            :icon="VideoCameraIcon"
            title="No videos yet"
            description="This functionality is not yet included in the CMS."
        />
    </BasePage>
</template>
