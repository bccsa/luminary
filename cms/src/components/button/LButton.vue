<script setup lang="ts">
import { type Component, computed, useSlots, ref } from "vue";
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
    dropdownAnchor?: boolean;
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
    mainDynamicCss: undefined,
    leftAction: undefined,
    mainAction: undefined,
    rightAction: undefined,
});

const slots = useSlots();
const isSegmented = computed(() => props.segmented || Boolean(slots.left) || Boolean(slots.right));
const rightSegmentRef = ref<HTMLElement | null>(null);
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

    // Handle dropdown anchor specific logic (Right segment)
    if (segment === "right" && props.dropdownAnchor) {
        // If clicking inside the dropdown panel, do nothing (let events bubble)
        const panel = rightSegmentRef.value?.querySelector<HTMLElement>("[data-dropdown-panel]");
        if (panel && panel.contains(event.target as Node)) {
            return;
        }

        // If a custom rightAction is provided, use it
        if (props.rightAction) {
            props.rightAction(event);
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        // Otherwise, always forward the click to the dropdown trigger
        // This ensures clicking anywhere on the segment (including padding) toggles the dropdown
        const trigger =
            rightSegmentRef.value?.querySelector<HTMLElement>("[data-dropdown-trigger]");
        if (trigger) {
            trigger.click();
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        // Fallback: emit event if trigger not found
        emit("right-click", event);
        return;
    }

    // Standard segments
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
}
</script>

<template>
    <!-- segmented button -->
    <div
        v-if="isSegmented"
        role="group"
        class="isolate inline-flex items-stretch"
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

        <!-- RIGHT SEGMENT -->
        <component
            v-if="$slots.right"
            ref="rightSegmentRef"
            :is="dropdownAnchor ? 'div' : 'button'"
            :type="dropdownAnchor ? undefined : 'button'"
            :disabled="dropdownAnchor ? undefined : disabled"
            :class="[segmentClass(buttonClasses({ variant, size, context }), 'right'), 'relative']"
            :role="dropdownAnchor ? 'button' : undefined"
            :tabindex="dropdownAnchor ? 0 : undefined"
            @click="handleSegmentClick('right', $event as MouseEvent)"
        >
            <slot name="right" />
        </component>
    </div>

    <!--single button -->
    <component
        v-else
        :is="is"
        :disabled="disabled"
        :class="twMerge(buttonClasses({ variant, size, context }), mainDynamicCss)"
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
