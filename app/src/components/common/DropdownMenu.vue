<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from "vue";
import { useElementBounding, useWindowSize } from "@vueuse/core";
import LTeleport from "@/components/common/LTeleport.vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
    defineProps<{
        placement?: "bottom-end" | "bottom-start" | "bottom-center" | "top-start" | "top-end";
        panelClass?: string;
        /** Grow the panel to at least the trigger's width — for full-width or pill triggers. */
        width?: "auto";
    }>(),
    { placement: "bottom-end" },
);

const open = defineModel<boolean>("open", { required: true });
const rootRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);

function close() {
    open.value = false;
}

function onEscape(e: KeyboardEvent) {
    if (e.key === "Escape") close();
}

function onPointerDown(e: MouseEvent | TouchEvent) {
    if (!rootRef.value) return;
    if (rootRef.value.offsetParent === null) return;
    const target = e.target as Node;
    if (rootRef.value.contains(target)) return;
    // The panel is teleported out of the root, so it needs a containment check of its own —
    // without it, pointerdown on a menu item closes the menu before the click lands.
    if (panelRef.value?.contains(target)) return;
    close();
}

// Gap between trigger and panel, and the minimum inset the panel keeps from the viewport edge.
const GAP = 8;

const {
    left: triggerLeft,
    right: triggerRight,
    top: triggerTop,
    bottom: triggerBottom,
    width: triggerWidth,
    update: updateTrigger,
} = useElementBounding(triggerRef);
const {
    width: panelWidth,
    height: panelHeight,
    update: updatePanel,
} = useElementBounding(panelRef);
// Rotation already arrives as a resize, so skip the orientation media query.
const { width: windowWidth, height: windowHeight } = useWindowSize({ listenOrientation: false });

watch(open, async (isOpen) => {
    if (isOpen) {
        requestAnimationFrame(() => document.addEventListener("keydown", onEscape));
        document.addEventListener("pointerdown", onPointerDown);
    } else {
        document.removeEventListener("keydown", onEscape);
        document.removeEventListener("pointerdown", onPointerDown);
        return;
    }
    // The panel is kept mounted but hidden, so it has no measurable box until it shows.
    // Re-measure once it does — still before paint, so the first frame is already placed.
    await nextTick();
    updateTrigger();
    updatePanel();
});

onMounted(() => {
    if (open.value) {
        document.addEventListener("keydown", onEscape);
        document.addEventListener("pointerdown", onPointerDown);
    }
});

onUnmounted(() => {
    document.removeEventListener("keydown", onEscape);
    document.removeEventListener("pointerdown", onPointerDown);
});

// Flip to the opposite side when the preferred one can't fit the panel.
const above = computed(() => {
    const prefersAbove = props.placement.startsWith("top");
    const spaceAbove = triggerTop.value;
    const spaceBelow = windowHeight.value - triggerBottom.value;
    const needed = panelHeight.value + GAP;
    if (prefersAbove) return !(spaceAbove < needed && spaceBelow > spaceAbove);
    return spaceBelow < needed && spaceAbove > spaceBelow;
});

const panelLeft = computed(() => {
    const preferred = props.placement.endsWith("center")
        ? triggerLeft.value + triggerWidth.value / 2 - panelWidth.value / 2
        : props.placement.endsWith("start")
          ? triggerLeft.value
          : triggerRight.value - panelWidth.value;
    // Hold the panel inside the viewport: anchored purely to the trigger, a wide panel near
    // a screen edge hangs off it and widens the page instead of adapting (#2120).
    const maxLeft = Math.max(GAP, windowWidth.value - panelWidth.value - GAP);
    return Math.min(Math.max(preferred, GAP), maxLeft);
});

const panelStyle = computed(() => {
    const style: Record<string, string> = { left: `${panelLeft.value}px` };
    if (above.value) style.bottom = `${windowHeight.value - triggerTop.value + GAP}px`;
    else style.top = `${triggerBottom.value + GAP}px`;
    if (props.width === "auto") style.minWidth = `${triggerWidth.value}px`;
    return style;
});

const originClass = computed(() => {
    if (props.placement.endsWith("center")) return above.value ? "origin-bottom" : "origin-top";
    if (props.placement.endsWith("start"))
        return above.value ? "origin-bottom-left" : "origin-top-left";
    return above.value ? "origin-bottom-right" : "origin-top-right";
});

/**
 * Distance from the panel's left edge to the centre of the trigger, so a consumer's arrow
 * keeps pointing at the trigger after the panel has been clamped away from it.
 */
const triggerOffsetX = computed(() => {
    const offset = triggerLeft.value + triggerWidth.value / 2 - panelLeft.value;
    return Math.min(Math.max(offset, 0), panelWidth.value);
});
</script>

<template>
    <div
        ref="rootRef"
        class="relative"
        v-bind="$attrs"
    >
        <div
            ref="triggerRef"
            class="cursor-pointer outline-none"
            role="button"
            tabindex="0"
            aria-haspopup="menu"
            :aria-expanded="open"
            @click="open = !open"
            @keydown.enter.prevent="open = !open"
            @keydown.space.prevent="open = !open"
        >
            <slot name="trigger" />
        </div>
        <LTeleport>
            <div
                v-show="open"
                ref="panelRef"
                role="menu"
                class="fixed z-[60] min-w-[8rem] max-w-[calc(100vw-1rem)] rounded-md bg-white py-2 shadow-lg ring-1 ring-zinc-900/5 focus:outline-none dark:bg-slate-700"
                :class="[originClass, panelClass]"
                :style="panelStyle"
            >
                <slot
                    :triggerOffsetX="triggerOffsetX"
                    :above="above"
                />
            </div>
        </LTeleport>
    </div>
</template>
