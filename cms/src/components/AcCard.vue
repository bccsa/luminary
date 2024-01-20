<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
    <div class="overflow-hidden rounded-md border border-solid border-gray-200 bg-white shadow-sm">
        <div v-if="title" class="border-b border-gray-200 bg-gray-50 px-4 py-5 sm:px-6">
            <h3 class="text-base font-semibold leading-6 text-gray-900">{{ title }}</h3>
        </div>
        <div class="px-4 py-5 sm:px-6">
            <slot />
        </div>
    </div>
</template>
