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
        "text-yellow-950 bg-yellow-300 ring-1 ring-inset ring-yellow-400/80 active:bg-yellow-300/80 hover:bg-yellow-300/80",
    secondary: "bg-white text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50",
};

const iconVariants = {
    primary: "text-yellow-700/80 group-hover:text-yellow-800 group-active:text-yellow-800",
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
        class="group inline-flex items-center gap-x-1.5 rounded-md text-sm font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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
