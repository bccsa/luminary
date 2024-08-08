<script setup lang="ts">
import {
    CheckCircleIcon,
    EllipsisHorizontalCircleIcon,
    ExclamationCircleIcon,
    XCircleIcon,
} from "@heroicons/vue/16/solid";
import { computed, type FunctionalComponent } from "vue";

type Props = {
    variant?: keyof typeof variants;
    type?: "default" | "language";
    noIcon?: boolean;
    customColor?: string;
    customIcon?: FunctionalComponent | null;
    customText?: string;
};

const props = withDefaults(defineProps<Props>(), {
    variant: "default",
    type: "default",
    noIcon: false,
    customColor: "",
    customIcon: null,
    customText: "",
});

const variants = {
    default: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    success: "bg-green-100 text-green-700 ring-green-200",
    warning: "bg-yellow-100 text-yellow-800 ring-yellow-300",
    error: "bg-red-100 text-red-700 ring-red-200",
    info: "bg-blue-100 text-blue-700 ring-blue-200",
};

const getDefaultIcon = computed(() => {
    if (props.type === "language") {
        switch (props.variant) {
            case "success":
                return CheckCircleIcon;
            case "info":
                return EllipsisHorizontalCircleIcon;
            case "warning":
                return ExclamationCircleIcon;
            case "error":
                return ExclamationCircleIcon;
            default:
                return XCircleIcon;
        }
    }
    return null;
});
</script>

<template>
    <span
        :class="[
            customColor || variants[variant],
            'inline-flex items-center rounded-md px-2 py-1 text-xs',
            {
                'flex justify-center font-medium uppercase tracking-widest ring ring-inset':
                    type == 'language',
                'w-12': type === 'language' && noIcon,
                'w-16': type === 'language' && !noIcon,
            },
        ]"
    >
        <component :is="customIcon || getDefaultIcon" class="-ml-0.5 mr-1 h-3 w-3" v-if="!noIcon" />
        <span v-if="customText" class="normal-case">{{ customText }}</span>
        <slot v-else />
    </span>
</template>
