<script setup lang="ts">
type Props = {
    state?: "default" | "error";
};

withDefaults(defineProps<Props>(), {
    state: "default",
});
</script>

<template>
    <p
        class="mt-2 text-sm"
        :class="{ 'text-gray-600': state == 'default', 'text-red-600': state == 'error' }"
    >
        <slot />
    </p>
</template>
