<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
    <div>
        <div class="flex flex-col gap-4 sm:flex-row sm:justify-between">
            <h1 class="text-lg font-semibold leading-7">{{ title }}</h1>

            <div v-if="$slots.actions">
                <slot name="actions" />
            </div>
        </div>

        <div class="mt-6">
            <slot />
        </div>
    </div>
</template>
