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
            'dark:text-zinc-400': state == 'default',
            'dark:text-red-400': state == 'error',
            'dark:text-yellow-400': state == 'warning',
        }"
    >
        <slot />
    </p>
</template>
