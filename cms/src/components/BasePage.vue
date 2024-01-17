<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
    <div>
        <h1 class="text-lg font-semibold leading-7">{{ title }}</h1>

        <div class="mt-6">
            <slot />
        </div>
    </div>
</template>
