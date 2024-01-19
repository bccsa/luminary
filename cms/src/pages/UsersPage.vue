<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";
import { UserIcon } from "@heroicons/vue/24/outline";
</script>

<template>
    <BasePage title="Users">
        <EmptyState
            :icon="UserIcon"
            title="No users yet"
            description="This functionality is not yet included in the CMS."
        />
    </BasePage>
</template>
