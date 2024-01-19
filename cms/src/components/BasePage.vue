<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
    <div>
        <div class="flex justify-between">
            <h1 class="text-lg font-semibold leading-7">{{ title }}</h1>

            <div>
                <slot name="actions" />
            </div>
        </div>

        <div class="mt-6">
            <slot />
        </div>
    </div>
</template>
