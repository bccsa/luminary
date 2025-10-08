<script setup lang="ts">
import { type Component, computed, useSlots } from "vue";
import { cva, type VariantProps } from "cva";
import { twMerge } from "tailwind-merge";

const buttonClasses = cva({
    base: "group inline-flex items-center justify-center gap-x-1.5 rounded-md text-sm font-semibold ring-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default relative",
    variants: {
        variant: {
            primary:
                "bg-zinc-700 ring-1 shadow-sm text-white ring-zinc-900/60 hover:bg-zinc-800/90 active:bg-zinc-800/80 active:text-zinc-50 disabled:bg-zinc-300 disabled:text-zinc-100 disabled:ring-zinc-300",
            secondary:
                "bg-white ring-1 shadow-sm text-zinc-900 ring-zinc-300 hover:bg-zinc-50 active:bg-zinc-100/70 disabled:bg-zinc-100 disabled:text-zinc-500",
            tertiary:
                "bg-transparent text-zinc-700 hover:text-zinc-950 disabled:text-zinc-500 disabled:hover:bg-transparent",
            muted: "bg-transparent text-zinc-600 hover:text-zinc-700 active:text-zinc-800 hover:bg-zinc-100 active:bg-zinc-200 disabled:text-zinc-400 disabled:hover:bg-transparent",
        },
        size: {
            sm: "px-2 py-1.5",
            base: "px-3 py-2",
            lg: "px-3.5 py-2.5",
        },
        context: {
            default: "",
            danger: "",
        },
    },
    compoundVariants: [
        {
            variant: "primary",
            context: "danger",
            class: "bg-red-600 ring-red-700/60 hover:bg-red-600/80 active:text-white active:bg-red-600/70 disabled:bg-red-300 disabled:text-red-50 disabled:ring-red-300/90",
        },
        {
            variant: "secondary",
            context: "danger",
            class: "text-red-600 active:text-red-700 disabled:text-red-300",
        },
        {
            variant: "tertiary",
            context: "danger",
            class: "hover:text-red-600 active:text-red-700",
        },
        {
            variant: "muted",
            size: "sm",
            class: "-mx-2 -my-1.5",
        },
        {
            variant: "muted",
            size: "base",
            class: "-mx-3 -my-2",
        },
        {
            variant: "muted",
            size: "lg",
            class: "-mx-3.5 -my-2.5",
        },
    ],
});

type ButtonProps = VariantProps<typeof buttonClasses>;

type Props = {
    is?: "button" | "a" | string | Component;
    variant?: ButtonProps["variant"];
    size?: ButtonProps["size"];
    context?: ButtonProps["context"];
    icon?: Component | Function;
    iconRight?: boolean;
    disabled?: boolean;
    segmented?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    is: "button",
    variant: "secondary",
    context: "default",
    size: "base",
    iconRight: false,
    disabled: false,
    segmented: false,
});

const slots = useSlots();
const isSegmented = computed(() => props.segmented || Boolean(slots.left) || Boolean(slots.right));

function segmentClass(base: string, position: "left" | "middle" | "right") {
    // Remove rounding from base and re-apply per segment; draw dividers between internal segments.
    // Tailwind's ordering ensures later classes override earlier ones when merged.
    const radius =
        position === "left"
            ? "rounded-l-md"
            : position === "right"
              ? "rounded-r-md"
              : "rounded-none";
    const divider = position !== "left" ? "border-l" : "";
    // Neutral divider color; could map per variant if needed later.
    const dividerColor = position !== "left" ? "border-zinc-300" : "";
    return twMerge(base, "rounded-none", radius, divider, dividerColor);
}

const iconVariants = {
    primary: "text-zinc-100 group-hover:text-zinc-50 group-active:text-white",
    secondary: "text-zinc-800/80 group-hover:text-zinc-900/80 group-active:text-zinc-900/80",
    tertiary: "text-zinc-800/80 group-hover:text-zinc-900/80 group-active:text-zinc-900/80",
    muted: "",
};

const tooltipVariants = {
    primary: "bg-zinc-900 text-white",
    secondary: "bg-white text-zinc-900 border border-zinc-200",
    tertiary: "bg-white text-zinc-900 border border-zinc-200",
    muted: "bg-white text-zinc-600 border border-zinc-200",
};
</script>

<template>
    <!-- Segmented mode: wrapper group with up to three interactive regions -->
    <div
        v-if="isSegmented"
        role="group"
        class="isolate inline-flex items-stretch"
        :class="{
            'pointer-events-none opacity-50': disabled,
        }"
    >
        <!-- Left segment -->
        <button
            v-if="$slots.left"
            type="button"
            :disabled="disabled"
            :class="segmentClass(buttonClasses({ variant, size, context }), 'left')"
        >
            <slot name="left" />
        </button>
        <!-- Main segment (inherits original content/icon behavior) -->
        <button
            type="button"
            :disabled="disabled"
            :class="
                segmentClass(
                    buttonClasses({ variant, size, context }),
                    $slots.left && $slots.right
                        ? 'middle'
                        : $slots.left
                          ? 'right'
                          : $slots.right
                            ? 'left'
                            : 'middle',
                )
            "
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
            <span v-if="$slots.default" :class="[iconRight ? 'order-1' : 'order-3']">
                <slot />
            </span>
        </button>
        <!-- Right segment -->
        <button
            v-if="$slots.right"
            type="button"
            :disabled="disabled"
            :class="segmentClass(buttonClasses({ variant, size, context }), 'right')"
        >
            <slot name="right" />
        </button>
    </div>
    <!-- Standard single button mode -->
    <component
        v-else
        :is="is"
        :disabled="disabled"
        :class="twMerge(buttonClasses({ variant, size, context }))"
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
        <span
            v-if="$slots.tooltip"
            class="absolute left-1/2 top-full z-10 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs shadow-sm group-hover:block"
            :class="tooltipVariants[variant]"
        >
            <slot name="tooltip" />
            <span
                class="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-inherit"
            ></span>
        </span>
    </component>
</template>
