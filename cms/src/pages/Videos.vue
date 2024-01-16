<script setup lang="ts">
import Page from "@/components/Page.vue";
import EmptyState from "@/components/EmptyState.vue";
import { VideoCameraIcon } from "@heroicons/vue/24/outline";
</script>

<template>
    <Page title="Videos">
        <EmptyState
            :icon="VideoCameraIcon"
            title="No videos yet"
            description="This functionality is not yet included in the CMS."
        />
    </Page>
</template>
