<script setup lang="ts">
import OnlineIndicator from "../OnlineIndicator.vue";
</script>

<template>
    <div class="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div class="relative flex flex-1 items-center justify-between gap-1">
            <slot name="quickActions" />
        </div>
        <div class="flex items-center gap-2">
            <OnlineIndicator />
        </div>
    </div>
    <div>
        <slot name="contentActions" />
    </div>
</template>
