<script setup lang="ts">
type Props = {
    state?: "default" | "error" | "warning";
};

withDefaults(defineProps<Props>(), {
    state: "default",
});
</script>

<template>
    <p
        class="mt-2 text-sm"
        :class="{
            'dark:text-zinc-400 text-zinc-600': state == 'default',
            'dark:text-red-400 text-red-600': state == 'error',
            'dark:text-yellow-400 text-yellow-600': state == 'warning',
        }"
    >
        <slot />
    </p>
</template>
