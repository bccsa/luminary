<script setup lang="ts">
import type { Component } from "vue";

type Props = {
    is?: "button" | "a" | string | Component;
    variant?: keyof typeof variants;
    size?: keyof typeof sizes;
    icon?: Component | Function;
    iconRight?: boolean;
    disabled?: boolean;
};

withDefaults(defineProps<Props>(), {
    is: "button",
    variant: "primary",
    size: "base",
    iconRight: false,
    disabled: false,
});

const variants = {
    primary:
        "bg-gray-900 text-white ring-gray-900/60 hover:bg-gray-900/90 active:bg-gray-900/80 disabled:bg-gray-500 disabled:text-gray-100 disabled:ring-gray-500",
    secondary:
        "bg-white text-gray-900 ring-gray-300 hover:bg-gray-50 active:bg-gray-100 disabled:bg-gray-100 disabled:text-gray-500",
};

const iconVariants = {
    primary: "text-gray-100 group-hover:text-gray-50 group-active:text-white",
    secondary: "text-gray-600/80 group-hover:text-gray-900/80 group-active:text-gray-900/80",
};

const sizes = {
    sm: "px-2 py-1.5",
    base: "px-3 py-2",
    lg: "px-3.5 py-2.5",
};
</script>

<template>
    <component
        :is="is"
        :disabled="disabled"
        class="group inline-flex items-center gap-x-1.5 rounded-md text-sm font-semibold shadow-sm ring-1 ring-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
        :class="[variants[variant], sizes[size]]"
    >
        <component
            v-if="icon"
            :is="icon"
            class="order-2 h-5 w-5"
            :class="[iconVariants[variant], { '-mr-0.5': iconRight, '-ml-0.5': !iconRight }]"
        />
        <span v-if="$slots.default" :class="[iconRight ? 'order-1' : 'order-3']"><slot /></span>
    </component>
</template>
