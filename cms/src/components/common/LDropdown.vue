<script lang="ts" setup>
import { ref, computed, watch, nextTick } from "vue";
import { onClickOutside } from "@vueuse/core";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
    padding?: "small" | "medium" | "large" | "none";
    placement?: "bottom-end" | "bottom-start";
    triggerClass?: string;
}>();

const show = defineModel<boolean>("show", { required: true });
const rootRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const panelId = `dropdown-panel-${Math.random().toString(36).slice(2)}`;

const toggle = () => (show.value = !show.value);
const close = () => (show.value = false);

onClickOutside(rootRef, () => {
    if (show.value) close();
});

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

const placementClasses = computed(() => {
    switch (props.placement) {
        case "bottom-start":
            return "left-0 top-full";
        case "bottom-end":
        default:
            return "right-0 top-full";
    }
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
    <div ref="rootRef" class="relative inline-flex" v-bind="$attrs">
        <div
            class="cursor-pointer select-none outline-none focus:outline-none"
            :class="props.triggerClass"
            role="button"
            tabindex="0"
            aria-haspopup="menu"
            :aria-expanded="show ? 'true' : 'false'"
            :aria-controls="show ? panelId : undefined"
            data-dropdown-trigger
            @click.stop="toggle()"
            @keydown.enter.prevent.stop="toggle()"
            @keydown.space.prevent.stop="toggle()"
        >
            <slot name="trigger" />
        </div>

        <div
            v-show="show"
            ref="panelRef"
            :id="panelId"
            class="absolute z-[9999] mt-1 w-56 origin-top rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
            :class="placementClasses"
            role="menu"
            @keydown="onPanelKeydown"
        >
            <div class="py-1" :class="paddingClass">
                <slot />
            </div>
        </div>
    </div>
</template>
