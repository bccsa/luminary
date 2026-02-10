<script setup lang="ts">
import type { Component } from "vue";

type Props = {
    is?: "button" | "a" | string | Component;
    variant?: keyof typeof variants;
    size?: keyof typeof sizes;
    icon?: Component | Function | string;
    iconRight?: boolean;
    disabled?: boolean;
    rounding?: "default" | "less";
};

withDefaults(defineProps<Props>(), {
    is: "button",
    variant: "secondary",
    size: "base",
    iconRight: false,
    disabled: false,
    rounding: "default",
});

const variants = {
    primary:
        "bg-yellow-500 ring-1 shadow-sm text-yellow-950 ring-yellow-600/60 hover:bg-yellow-400/90 active:bg-yellow-500/80 disabled:bg-yellow-200 disabled:text-yellow-500 disabled:ring-yellow-200",
    secondary:
        "bg-white dark:bg-slate-600 dark:hover:bg-slate-600/50 ring-1 dark:ring-slate-400 shadow-sm dark:text-slate-200 text-zinc-900 ring-zinc-300 hover:bg-zinc-100 active:bg-zinc-200/70 disabled:bg-zinc-100 disabled:text-zinc-500",
    tertiary:
        "bg-transparent text-zinc-900 hover:text-zinc-950 hover:bg-zinc-100 active:bg-zinc-200 disabled:text-zinc-500 disabled:hover:bg-transparent",
};

const iconVariants = {
    primary: "text-zinc-100 group-hover:text-zinc-50 group-active:text-white",
    secondary: "text-zinc-800/80 group-hover:text-zinc-900/80 group-active:text-zinc-900/80",
    tertiary: "text-zinc-800/80 group-hover:text-zinc-900/80 group-active:text-zinc-900/80",
};

const sizes = {
    sm: "px-2.5 py-1.5 text-sm",
    base: "px-3.5 py-2 text-sm",
    lg: "px-4 py-2.5 text-sm",
    xl: "px-4.5 py-3",
};

const roundingClasses = {
    default: "rounded-md",
    less: "rounded-lg",
};
</script>

<template>
    <component
        :is="is"
        :disabled="disabled"
        :class="[
            variants[variant],
            sizes[size],
            roundingClasses[rounding],
            'group inline-flex items-center justify-center gap-x-1.5 font-semibold ring-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed',
        ]"
    >
        <template v-if="typeof icon === 'string'">
            <img
                :src="icon"
                alt="Icon"
                class="order-2"
                :class="{
                    'h-5 w-5': size != 'xl',
                    'mr-0.5 h-6 w-6': size == 'xl',
                    '-mr-0.5': iconRight && $slots.default,
                    '-ml-0.5': !iconRight && $slots.default,
                }"
            />
        </template>
        <component
            v-else-if="icon"
            :is="icon"
            class="order-2"
            :class="{
                'h-5 w-5': size != 'xl',
                'mr-0.5 h-6 w-6': size == 'xl',
                [iconVariants[variant]]: $slots.default,
                '-mr-0.5': iconRight && $slots.default,
                '-ml-0.5': !iconRight && $slots.default,
            }"
        />
        <span v-if="$slots.default" :class="[iconRight ? 'order-1' : 'order-3']"><slot /></span>
    </component>
</template>
