<script setup lang="ts">
type Props = {
    variant?: keyof typeof variants;
};

withDefaults(defineProps<Props>(), {
    variant: "default",
});

const variants = {
    default: "bg-gray-100 text-gray-600",
    success: "bg-green-100 text-green-700",
    warning: "bg-yellow-100 text-yellow-800",
    error: "bg-red-100 text-red-700",
    info: "bg-blue-100 text-blue-700",
};
</script>

<template>
    <span class="inline-flex items-center rounded-md px-2 py-1 text-xs" :class="variants[variant]">
        <slot />
    </span>
</template>
