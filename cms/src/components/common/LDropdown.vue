<script lang="ts" setup>
import { ref, computed, watch, nextTick } from "vue";
import { onClickOutside, useEventListener } from "@vueuse/core";
import LTeleport from "./LTeleport.vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
    padding?: "small" | "medium" | "large" | "none";
    placement?: "bottom-end" | "bottom-start" | "top-end" | "top-start" | "top-center";
    triggerClass?: string;
    width?: "auto" | "full" | "default";
}>();

const show = defineModel<boolean>("show", { required: true });
const rootRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const panelId = `dropdown-panel-${Math.random().toString(36).slice(2)}`;
const triggerRect = ref<DOMRect | null>(null);
const GAP = 4;

const toggle = () => (show.value = !show.value);
const close = () => (show.value = false);

const updateTriggerRect = () => {
    if (!show.value) return;
    triggerRect.value = rootRef.value?.getBoundingClientRect() ?? null;
};

const onTriggerClick = (event: MouseEvent) => {
    if (event.defaultPrevented) return;
    toggle();
};

onClickOutside(rootRef, () => {
    if (show.value) close();
}, { ignore: [panelRef] });

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
        nextTick(() => {
            updateTriggerRect();
            focusFirst();
        });
    } else {
        triggerRect.value = null;
    }
});

useEventListener("resize", updateTriggerRect);
useEventListener("scroll", updateTriggerRect, { capture: true });

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

const panelStyle = computed((): Record<string, string> => {
    const rect = triggerRect.value;
    if (!rect) return { position: "fixed", zIndex: "9999" };
    const style: Record<string, string> = { position: "fixed", zIndex: "9999" };
    switch (props.placement) {
        case "bottom-start":
            style.left = `${rect.left}px`;
            style.top = `${rect.bottom + GAP}px`;
            break;
        case "bottom-end":
            style.right = `${window.innerWidth - rect.right}px`;
            style.top = `${rect.bottom + GAP}px`;
            break;
        case "top-start":
            style.left = `${rect.left}px`;
            style.bottom = `${window.innerHeight - rect.top + GAP}px`;
            break;
        case "top-end":
            style.right = `${window.innerWidth - rect.right}px`;
            style.bottom = `${window.innerHeight - rect.top + GAP}px`;
            break;
        case "top-center":
            style.left = `${rect.left + rect.width / 2}px`;
            style.transform = "translateX(-50%)";
            style.bottom = `${window.innerHeight - rect.top + GAP}px`;
            break;
        default:
            style.right = `${window.innerWidth - rect.right}px`;
            style.top = `${rect.bottom + GAP}px`;
    }
    if (props.width === "full") {
        style.width = `${rect.width}px`;
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

const widthClass = computed(() => {
    switch (props.width) {
        case "auto":
            return "w-auto";
        case "full":
            return "w-full";
        case "default":
        default:
            return "w-56";
    }
});
</script>

<template>
    <div ref="rootRef" class="inline-flex" v-bind="$attrs">
        <div
            class="size-full cursor-pointer select-none outline-none focus:outline-none"
            :class="props.triggerClass"
            role="button"
            tabindex="0"
            aria-haspopup="menu"
            :aria-expanded="show ? 'true' : 'false'"
            :aria-controls="show ? panelId : undefined"
            data-dropdown-trigger
            @click.capture="onTriggerClick"
            @keydown.enter.prevent.stop="toggle()"
            @keydown.space.prevent.stop="toggle()"
        >
            <slot name="trigger" />
        </div>

        <LTeleport v-if="show">
            <div
                ref="panelRef"
                :id="panelId"
                class="origin-top rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
                :class="[
                    widthClass,
                    props.placement?.startsWith('top') ? 'origin-bottom' : 'origin-top',
                ]"
                :style="panelStyle"
                role="menu"
                data-dropdown-panel
                @keydown="onPanelKeydown"
            >
                <div class="py-1" :class="paddingClass">
                    <slot />
                </div>
            </div>
        </LTeleport>
    </div>
</template>
