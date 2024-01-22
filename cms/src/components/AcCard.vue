<script setup lang="ts">
import { type Component } from "vue";

defineProps<{
    title?: string;
    icon?: string | Component | Function;
}>();
</script>

<template>
    <div class="overflow-hidden rounded-md border border-gray-100 bg-white shadow">
        <div v-if="title || icon" class="flex items-center gap-2 px-4 pt-5 sm:px-6">
            <component v-if="icon" :is="icon" class="h-4 w-4 text-gray-600" />
            <h3 class="text-sm font-semibold leading-6 text-gray-900">{{ title }}</h3>
        </div>
        <div class="px-4 py-5 sm:px-6">
            <slot />
        </div>
    </div>
</template>
