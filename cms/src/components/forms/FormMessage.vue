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
            'text-zinc-600 dark:text-zinc-400': state == 'default',
            'text-red-600 dark:text-red-400': state == 'error',
            'text-yellow-600 dark:text-yellow-400': state == 'warning',
        }"
    >
        <slot />
    </p>
</template>
