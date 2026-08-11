<script setup lang="ts">
import { type Component, computed, useSlots, ref } from "vue";
import { cva, type VariantProps } from "cva";
import { twMerge } from "tailwind-merge";
import { isMobileScreen } from "@/globalConfig";

const buttonClasses = cva({
    base: "group inline-flex items-center justify-center gap-x-1.5 rounded-md text-sm font-semibold ring-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default relative",
    variants: {
        variant: {
            primary:
                "bg-zinc-700 ring-1 shadow-sm text-white ring-zinc-900/60 hover:bg-zinc-800/90 active:bg-zinc-800/80 dark:bg-slate-700 dark:text-zinc-100 dark:ring-white/10 dark:hover:bg-slate-600 dark:active:bg-zinc-300 disabled:bg-zinc-300 disabled:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600",
            secondary:
                "bg-white ring-1 shadow-sm text-zinc-900 ring-zinc-300 hover:bg-zinc-50 active:bg-zinc-100/70 dark:bg-slate-700 dark:text-zinc-100 dark:ring-slate-600 dark:hover:bg-slate-600 dark:active:bg-slate-500 disabled:bg-zinc-100 disabled:text-zinc-500 dark:disabled:bg-slate-900 dark:disabled:text-zinc-700",
            tertiary:
                "bg-transparent text-zinc-700 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 disabled:text-zinc-500",
            muted: "bg-transparent text-zinc-600 hover:text-zinc-700 active:text-zinc-800 hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-slate-800/50 disabled:text-zinc-400",
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
            class: "bg-red-600 ring-red-700/60 hover:bg-red-600/80 dark:bg-red-500 dark:hover:bg-red-400 active:text-white active:bg-red-600/70 disabled:bg-red-300 disabled:text-red-50 disabled:ring-red-300/90",
        },
        {
            variant: "secondary",
            context: "danger",
            class: "text-red-600 active:text-red-700 disabled:text-red-300 dark:text-red-400 dark:hover:text-red-300",
        },
        {
            variant: "tertiary",
            context: "danger",
            class: "hover:text-red-600 active:text-red-700",
        },
        { variant: "muted", size: "sm", class: "-mx-2 -my-1.5" },
        { variant: "muted", size: "base", class: "-mx-3 -my-2" },
        { variant: "muted", size: "lg", class: "-mx-3.5 -my-2.5" },
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
    smallIcon?: boolean;
    dropdownAnchor?: boolean;
    iconClass?: string;
    mainDynamicCss?: string; // NEW: custom background for main (middle) segment
    leftAction?: (event: MouseEvent) => void | Promise<void>;
    mainAction?: (event: MouseEvent) => void | Promise<void>;
    rightAction?: (event: MouseEvent) => void | Promise<void>;
};

const props = withDefaults(defineProps<Props>(), {
    is: "button",
    variant: "secondary",
    context: "default",
    size: "base",
    iconRight: false,
    disabled: false,
    segmented: false,
    dropdownAnchor: false,
    iconClass: undefined,
    mainDynamicCss: undefined,
    leftAction: undefined,
    mainAction: undefined,
    rightAction: undefined,
});

const slots = useSlots();
const isSegmented = computed(() => props.segmented || Boolean(slots.left) || Boolean(slots.right));
const rightSegmentRef = ref<HTMLElement | null>(null);
// Root element of the segmented control, exposed so a slotted dropdown can size itself to the
// whole button rather than just the segment it lives in.
const rootRef = ref<HTMLElement | null>(null);
defineExpose({ rootEl: rootRef });
const emit = defineEmits<{
    (e: "left-click", event: MouseEvent): void;
    (e: "main-click", event: MouseEvent): void;
    (e: "right-click", event: MouseEvent): void;
}>();

function segmentClass(base: string, position: "left" | "middle" | "right") {
    const radius =
        position === "left"
            ? "rounded-l-md"
            : position === "right"
              ? "rounded-r-md"
              : "rounded-none";
    const divider = position !== "left" ? "border-l" : "";
    const dividerColor = position !== "left" ? "border-zinc-300 dark:border-slate-600" : "";
    return twMerge(base, "rounded-none", radius, divider, dividerColor);
}

const iconVariants = {
    primary: "text-zinc-100 group-hover:text-zinc-50 group-active:text-white dark:text-zinc-800",
    secondary:
        "text-zinc-800/80 group-hover:text-zinc-900/80 group-active:text-zinc-900/80 dark:text-zinc-400 dark:group-hover:text-zinc-100",
    tertiary:
        "text-zinc-800/80 group-hover:text-zinc-900/80 group-active:text-zinc-900/80 dark:text-zinc-400 dark:group-hover:text-zinc-100",
    muted: "dark:text-zinc-500",
};

const tooltipVariants = {
    primary: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
    secondary:
        "bg-white text-zinc-900 border border-zinc-200 dark:bg-slate-800 dark:text-zinc-100 dark:border-slate-600",
    tertiary:
        "bg-white text-zinc-900 border border-zinc-200 dark:bg-slate-800 dark:text-zinc-100 dark:border-slate-600",
    muted: "bg-white text-zinc-600 border border-zinc-200 dark:bg-slate-800 dark:text-zinc-400 dark:border-slate-600",
};

type Segment = "left" | "main" | "right";

function handleSegmentClick(segment: Segment, event: MouseEvent) {
    if (props.disabled) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }

    if (event.defaultPrevented) {
        event.stopPropagation();
        return;
    }

    if (segment === "right" && props.dropdownAnchor) {
        if (props.rightAction) {
            props.rightAction(event);
            event.preventDefault();
            event.stopPropagation();
        }
        return;
    }

    if (segment === "right" && props.dropdownAnchor) {
        const panel = rightSegmentRef.value?.querySelector<HTMLElement>("[data-dropdown-panel]");
        if (panel && panel.contains(event.target as Node)) {
            return;
        }
    }

    if (segment === "left") emit("left-click", event);
    if (segment === "main") emit("main-click", event);
    if (segment === "right") emit("right-click", event);

    const action =
        segment === "left"
            ? props.leftAction
            : segment === "main"
              ? props.mainAction
              : props.rightAction;
    if (action) {
        event.preventDefault();
        event.stopPropagation();
        action(event);
        return;
    }

    event.stopPropagation();
}
</script>

<template>
    <!-- ====================== SEGMENTED MODE ====================== -->
    <div
        v-if="isSegmented"
        ref="rootRef"
        role="group"
        class="inline-flex items-stretch"
        :class="{ 'pointer-events-none opacity-50': disabled }"
    >
        <!-- LEFT SEGMENT -->
        <button
            v-if="$slots.left"
            type="button"
            :disabled="disabled"
            :class="segmentClass(buttonClasses({ variant, size, context }), 'left')"
            @click="handleSegmentClick('left', $event)"
        >
            <slot name="left" />
        </button>

        <!-- MIDDLE SEGMENT (MAIN) – now supports custom bg via mainBg -->
        <button
            type="button"
            :disabled="disabled"
            :class="
                twMerge(
                    segmentClass(
                        buttonClasses({ variant, size, context }),
                        $slots.left && $slots.right
                            ? 'middle'
                            : $slots.left
                              ? 'right'
                              : $slots.right
                                ? 'left'
                                : 'middle',
                    ),
                    mainDynamicCss,
                )
            "
            @click="handleSegmentClick('main', $event)"
        >
            <component
                v-if="icon"
                :is="icon"
                class="order-2"
                :class="{
                    [iconVariants[variant]]: $slots.default,
                    '-mr-0.5': iconRight && $slots.default,
                    '-ml-0.5': !iconRight && $slots.default,
                    'size-4': smallIcon && isMobileScreen,
                    'size-5': !smallIcon || !isMobileScreen,
                    [iconClass!]: iconClass,
                }"
            />
            <span v-if="$slots.default" :class="[iconRight ? 'order-1' : 'order-3']">
                <slot />
            </span>
        </button>

        <!-- RIGHT SEGMENT -->
        <component
            v-if="$slots.right"
            ref="rightSegmentRef"
            :is="dropdownAnchor ? 'div' : 'button'"
            :type="dropdownAnchor ? undefined : 'button'"
            :disabled="dropdownAnchor ? undefined : disabled"
            :class="
                twMerge(
                    segmentClass(buttonClasses({ variant, size, context }), 'right'),
                    'relative',
                    dropdownAnchor ? 'p-0' : '',
                )
            "
            :role="dropdownAnchor ? 'button' : undefined"
            :tabindex="dropdownAnchor ? 0 : undefined"
            @click.capture="handleSegmentClick('right', $event as MouseEvent)"
        >
            <slot name="right" />
        </component>
    </div>

    <!-- ====================== NORMAL BUTTON ====================== -->
    <component
        v-else
        :is="is"
        :disabled="disabled"
        :class="twMerge(buttonClasses({ variant, size, context }), mainDynamicCss)"
    >
        <component
            v-if="icon"
            :is="icon"
            class="order-2"
            :class="
                twMerge(
                    $slots.default ? iconVariants[variant] : '',
                    iconRight && $slots.default ? '-mr-0.5' : '',
                    !iconRight && $slots.default ? '-ml-0.5' : '',
                    smallIcon && isMobileScreen ? 'h-4 w-4' : '',
                    !smallIcon || !isMobileScreen ? 'h-5 w-5' : '',
                    iconClass,
                )
            "
        />
        <span v-if="$slots.default" :class="[iconRight ? 'order-1' : 'order-3']">
            <slot />
        </span>
        <!-- Tooltip -->
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
