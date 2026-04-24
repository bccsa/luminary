<script lang="ts" setup>
import { ref, computed, watch, nextTick } from "vue";
import { onClickOutside, useElementBounding, useWindowSize } from "@vueuse/core";
import LTeleport from "@/components/common/LTeleport.vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
    padding?: "small" | "medium" | "large" | "none";
    placement?:
        | "bottom-end"
        | "bottom-start"
        | "top-end"
        | "top-start"
        | "top-center"
        | "bottom-center";
    triggerClass?: string;
    width?: "auto" | "full" | "default";
}>();

const show = defineModel<boolean>("show", { required: true });
const rootRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);
const panelId = `dropdown-panel-${Math.random().toString(36).slice(2)}`;

const toggle = () => (show.value = !show.value);
const close = () => (show.value = false);

const {
    left: triggerLeft,
    top: triggerTop,
    bottom: triggerBottom,
    right: triggerRight,
    width: triggerWidth,
    update,
} = useElementBounding(triggerRef);
const { height: windowHeight } = useWindowSize();
const { width: panelWidth } = useElementBounding(panelRef);

const onTriggerClick = (event: MouseEvent) => {
    if (event.defaultPrevented) return;
    toggle();
};

onClickOutside(
    panelRef,
    () => {
        if (show.value) close();
    },
    { ignore: [triggerRef] },
);

// Focus first menuitem on open
const focusFirst = () => {
    if (!panelRef.value) return;
    const first = panelRef.value.querySelector<HTMLElement>(
        '[role="menuitem"],button,a,[tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
};

watch(show, (val) => {
    if (val) {
        update();
        nextTick(() => focusFirst());
    }
});

// Keyboard navigation inside panel (ArrowUp, ArrowDown, Enter, Escape)
const onPanelKeydown = (e: KeyboardEvent) => {
    if (!show.value || !panelRef.value) return;
    const items = Array.from(panelRef.value.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (items.length === 0) return;
    const currentIndex = items.findIndex((el) => el === document.activeElement);
    if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = items[(currentIndex + 1 + items.length) % items.length];
        next.focus();
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = items[(currentIndex - 1 + items.length) % items.length];
        prev.focus();
    } else if (e.key === "Enter") {
        if (currentIndex >= 0) {
            e.preventDefault();
            items[currentIndex].click();
        }
    } else if (e.key === "Escape") {
        e.preventDefault();
        close();
        const trigger = rootRef.value?.querySelector<HTMLElement>("[data-dropdown-trigger]");
        trigger?.focus();
    }
};

const positionData = computed(() => {
    if (!show.value) return undefined;

    const spaceBelow = windowHeight.value - triggerBottom.value;
    const spaceAbove = triggerTop.value;

    const flip = spaceBelow < 250 && spaceAbove > 250 && spaceAbove > spaceBelow;

    return { flip };
});

const panelStyle = computed(() => {
    if (!positionData.value) return {};
    const { flip } = positionData.value;
    const styleBottom = flip ? windowHeight.value - triggerTop.value + 2 : triggerBottom.value + 2;

    const style: Record<string, string> = {};
    switch (props.width) {
        case "auto":
            style.minWidth = `${triggerWidth.value}px`;
            break;
        case "full":
            style.width = `${triggerWidth.value}px`;
            break;
        case "default":
        default:
            style.width = "14rem";
            break;
    }
    switch (props.placement) {
        case "bottom-start":
            if (flip) style.bottom = `${styleBottom}px`;
            else style.top = `${styleBottom}px`;
            style.left = `${triggerLeft.value}px`;
            break;
        case "bottom-center":
            if (flip) style.bottom = `${styleBottom}px`;
            else style.top = `${styleBottom}px`;
            style.left = `${triggerLeft.value + triggerWidth.value / 2 - panelWidth.value / 2}px`;
            break;
        case "bottom-end":
            if (flip) style.bottom = `${styleBottom}px`;
            else style.top = `${styleBottom}px`;
            style.left = `${triggerRight.value - panelWidth.value}px`;
            break;
        case "top-start":
            style.bottom = `${windowHeight.value - triggerTop.value + 2}px`;
            style.left = `${triggerLeft.value}px`;
            break;
        case "top-end":
            style.bottom = `${windowHeight.value - triggerTop.value + 2}px`;
            style.left = `${triggerRight.value - panelWidth.value}px`;
            break;
        case "top-center":
            style.bottom = `${windowHeight.value - triggerTop.value + 2}px`;
            style.left = `${triggerLeft.value + triggerWidth.value / 2 - panelWidth.value / 2}px`;
            break;
        default:
            if (flip) style.bottom = `${styleBottom}px`;
            else style.top = `${styleBottom}px`;
            style.left = `${triggerRight.value - panelWidth.value}px`;
            break;
    }
    return style;
});

const paddingClass = computed(() =>
    props.padding === "small"
        ? "p-1"
        : props.padding === "medium"
          ? "p-2"
          : props.padding === "large"
            ? "p-3"
            : "p-0",
);
</script>

<template>
    <div ref="rootRef" class="inline-flex" v-bind="$attrs">
        <div
            ref="triggerRef"
            class="size-full cursor-pointer select-none outline-none focus:outline-none"
            :class="props.triggerClass"
            role="button"
            tabindex="0"
            aria-haspopup="menu"
            :aria-expanded="show ? 'true' : 'false'"
            :aria-controls="show ? panelId : undefined"
            data-dropdown-trigger
            @click.stop="onTriggerClick"
            @keydown.enter.prevent.stop="toggle()"
            @keydown.space.prevent.stop="toggle()"
        >
            <slot name="trigger" />
        </div>

        <LTeleport>
            <div
                v-if="show"
                ref="panelRef"
                :id="panelId"
                class="fixed z-[9999] max-h-60 overflow-y-auto rounded-md bg-white shadow-lg ring-1 ring-black/5 scrollbar-hide focus:outline-none"
                :class="[props.placement?.startsWith('top') ? 'origin-bottom' : 'origin-top']"
                role="menu"
                data-dropdown-panel
                @keydown="onPanelKeydown"
                :style="panelStyle"
            >
                <div :class="paddingClass">
                    <slot />
                </div>
            </div>
        </LTeleport>
    </div>
</template>
