<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";
import { TagIcon } from "@heroicons/vue/24/outline";
</script>

<template>
    <BasePage title="Audio Playlists">
        <EmptyState
            :icon="TagIcon"
            title="No audio playlists yet"
            description="This functionality is not yet included in the CMS."
        />
    </BasePage>
</template>
