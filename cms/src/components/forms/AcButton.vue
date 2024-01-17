<script setup lang="ts">
import type { Component } from "vue";

type Props = {
    is?: "button" | "a" | string | Component;
    variant?: keyof typeof variants;
    size?: keyof typeof sizes;
    icon?: string | Component | Function;
    iconRight?: boolean;
    disabled?: boolean;
};

withDefaults(defineProps<Props>(), {
    is: "button",
    variant: "primary",
    size: "lg",
    iconRight: false,
    disabled: false,
});

const variants = {
    primary: "bg-yellow-600 text-white hover:bg-yellow-500",
    secondary: "bg-white text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50",
};

const sizes = {
    xs: "px-2 py-1 text-xs",
    sm: "px-2 py-1",
    md: "px-2.5 py-1.5",
    lg: "px-3 py-2",
    xl: "px-3.5 py-2.5",
};
</script>

<template>
    <component
        :is="is"
        :disabled="disabled"
        class="inline-flex items-center gap-x-1.5 rounded-md text-sm font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-600"
        :class="[variants[variant], sizes[size]]"
    >
        <component
            v-if="icon"
            :is="icon"
            class="order-2 h-5 w-5"
            :class="{ '-mr-0.5': iconRight, '-ml-0.5': !iconRight }"
        />
        <span v-if="$slots.default" :class="[iconRight ? 'order-1' : 'order-3']"><slot /></span>
    </component>
</template>
