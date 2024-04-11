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
    variant: "secondary",
    size: "base",
    iconRight: false,
    disabled: false,
});

const variants = {
    primary:
        "bg-zinc-900 ring-1 shadow-sm text-white ring-zinc-900/60 hover:bg-zinc-900/90 active:bg-zinc-900/80 disabled:bg-zinc-500 disabled:text-zinc-100 disabled:ring-zinc-500",
    secondary:
        "bg-white ring-1 shadow-sm text-zinc-900 ring-zinc-300 hover:bg-zinc-100 active:bg-zinc-200/70 disabled:bg-zinc-100 disabled:text-zinc-500",
    tertiary:
        "bg-transparent text-zinc-900 hover:text-zinc-950 hover:bg-zinc-100 active:bg-zinc-200 disabled:text-zinc-500 disabled:hover:bg-transparent",
};

const iconVariants = {
    primary: "text-zinc-100 group-hover:text-zinc-50 group-active:text-white",
    secondary: "text-zinc-800/80 group-hover:text-zinc-900/80 group-active:text-zinc-900/80",
    tertiary: "text-zinc-800/80 group-hover:text-zinc-900/80 group-active:text-zinc-900/80",
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
        :class="[
            variants[variant],
            sizes[size],
            'group inline-flex items-center justify-center gap-x-1.5 rounded-md text-sm font-semibold ring-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed',
        ]"
    >
        <component
            v-if="icon"
            :is="icon"
            class="order-2 h-5 w-5"
            :class="{
                [iconVariants[variant]]: $slots.default,
                '-mr-0.5': iconRight && $slots.default,
                '-ml-0.5': !iconRight && $slots.default,
            }"
        />
        <span v-if="$slots.default" :class="[iconRight ? 'order-1' : 'order-3']"><slot /></span>
    </component>
</template>
