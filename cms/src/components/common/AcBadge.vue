<script setup lang="ts">
import {
    CheckCircleIcon,
    EllipsisHorizontalCircleIcon,
    ExclamationCircleIcon,
    XCircleIcon,
} from "@heroicons/vue/16/solid";

type Props = {
    variant?: keyof typeof variants;
    type?: "default" | "language";
    noIcon?: boolean;
};

withDefaults(defineProps<Props>(), {
    variant: "default",
    type: "default",
    noIcon: false,
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
        :class="[
            variants[variant],
            'inline-flex items-center rounded-md px-2 py-1 text-xs',
            {
                'flex justify-center font-medium uppercase tracking-widest ring ring-inset':
                    type == 'language',
                'w-12': type === 'language' && noIcon,
                'w-16': type === 'language' && !noIcon,
            },
        ]"
    >
        <XCircleIcon
            class="-ml-0.5 mr-1 h-3 w-3 text-gray-500"
            v-if="!noIcon && type == 'language' && variant == 'default'"
        />
        <CheckCircleIcon
            class="-ml-0.5 mr-1 h-3 w-3 text-green-600"
            v-if="!noIcon && type == 'language' && variant == 'success'"
        />
        <EllipsisHorizontalCircleIcon
            class="-ml-0.5 mr-1 h-3 w-3 text-blue-600"
            v-if="!noIcon && type == 'language' && variant == 'info'"
        />
        <ExclamationCircleIcon
            class="-ml-0.5 mr-1 h-3 w-3 text-yellow-600"
            v-if="!noIcon && type == 'language' && variant == 'warning'"
        />
        <ExclamationCircleIcon
            class="-ml-0.5 mr-1 h-3 w-3 text-red-600"
            v-if="!noIcon && type == 'language' && variant == 'error'"
        />
        <slot />
    </span>
</template>
