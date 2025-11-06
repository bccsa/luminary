<script lang="ts">
export const variants = {
    default: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    blue: "bg-blue-50 text-zinc-600 ring-zinc-200",
    success: "bg-green-100 text-green-700 ring-green-200",
    warning: "bg-yellow-100 text-yellow-800 ring-yellow-300",
    error: "bg-red-100 text-red-700 ring-red-200",
    info: "bg-blue-100 text-blue-700 ring-blue-200",
    scheduled: "bg-purple-100 text-purple-700 ring-purple-200",
    expired: "bg-cyan-100 text-cyan-700 ring-cyan-200",
};
</script>

<script setup lang="ts">
import {
    CheckCircleIcon,
    ClockIcon,
    EllipsisHorizontalCircleIcon,
    ExclamationCircleIcon,
    XCircleIcon,
    NoSymbolIcon,
} from "@heroicons/vue/16/solid";
import { computed, type Component } from "vue";

type Props = {
    variant?: keyof typeof variants;
    type?: "default" | "language";
    icon?: Component | null;
    withIcon?: boolean;
    paddingY?: string;
    paddingX?: string;
    rounded?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    variant: "default",
    type: "default",
    withIcon: false,
    customColor: "",
    paddingY: "py-1",
    paddingX: "px-2",
    rounded: true,
});

const defaultIcon = computed(() => {
    switch (props.variant) {
        case "success":
            return CheckCircleIcon;
        case "info":
            return EllipsisHorizontalCircleIcon;
        case "scheduled":
            return ClockIcon;
        case "warning":
            return ExclamationCircleIcon;
        case "error":
            return ExclamationCircleIcon;
        case "expired":
            return NoSymbolIcon;
        default:
            return XCircleIcon;
    }
});
</script>

<template>
    <span
        :class="[
            variants[variant],
            'inline-flex items-center  text-xs',
            rounded ? 'rounded-md' : '',
            paddingY,
            paddingX,
            {
                'flex justify-center font-medium uppercase tracking-widest ring ring-inset':
                    type == 'language',
                'w-12': type === 'language' && !withIcon,
                'w-16': type === 'language' && withIcon,
            },
        ]"
    >
        <component :is="icon || defaultIcon" class="-ml-0.5 mr-1 h-3 w-3" v-if="withIcon" />
        <slot />
    </span>
</template>
