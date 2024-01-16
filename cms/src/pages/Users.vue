<script setup lang="ts">
import Page from "@/components/Page.vue";
import EmptyState from "@/components/EmptyState.vue";
import { UserIcon } from "@heroicons/vue/24/outline";
</script>

<template>
    <Page title="Users">
        <EmptyState
            :icon="UserIcon"
            title="No users yet"
            description="This functionality is not yet included in the CMS."
        />
    </Page>
</template>
