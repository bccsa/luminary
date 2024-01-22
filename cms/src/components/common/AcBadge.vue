<script setup lang="ts">
type Props = {
    variant?: keyof typeof variants;
    type?: "default" | "language";
};

withDefaults(defineProps<Props>(), {
    variant: "default",
    type: "default",
});

const variants = {
    default: "bg-gray-100 text-gray-600 ring-gray-200",
    success: "bg-green-100 text-green-700 ring-green-200",
    warning: "bg-yellow-100 text-yellow-800 ring-yellow-300",
    error: "bg-red-100 text-red-700 ring-red-200",
    info: "bg-blue-100 text-blue-700 ring-blue-200",
};
</script>

<template>
    <span
        class="inline-flex items-center rounded-md px-2 py-1 text-xs"
        :class="[
            variants[variant],
            {
                'font-medium uppercase tracking-widest ring ring-inset': type == 'language',
            },
        ]"
    >
        <slot />
    </span>
</template>
