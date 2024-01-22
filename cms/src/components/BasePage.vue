<script setup lang="ts">
defineProps<{
    title?: string;
}>();
</script>

<template>
    <div>
        <header
            v-if="title || $slots.actions"
            class="flex flex-col gap-4 bg-gray-50 pb-6 sm:flex-row sm:justify-between"
        >
            <h1 class="text-lg font-semibold leading-7">{{ title }}</h1>

            <div v-if="$slots.actions">
                <slot name="actions" />
            </div>
        </header>

        <div>
            <slot />
        </div>
    </div>
</template>
