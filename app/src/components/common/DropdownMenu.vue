<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
    defineProps<{
        placement?: "bottom-end" | "bottom-start" | "top-end" | "top-start";
        panelClass?: string;
    }>(),
    { placement: "bottom-end" },
);

const open = defineModel<boolean>("open", { required: true });
const rootRef = ref<HTMLElement | null>(null);

function close() {
    open.value = false;
}

function onEscape(e: KeyboardEvent) {
    if (e.key === "Escape") close();
}

function onPointerDown(e: MouseEvent | TouchEvent) {
    if (rootRef.value && !rootRef.value.contains(e.target as Node)) close();
}

watch(open, (isOpen) => {
    if (isOpen) {
        requestAnimationFrame(() => document.addEventListener("keydown", onEscape));
        document.addEventListener("pointerdown", onPointerDown);
    } else {
        document.removeEventListener("keydown", onEscape);
        document.removeEventListener("pointerdown", onPointerDown);
    }
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

const placementClasses = computed(() => {
    switch (props.placement) {
        case "bottom-start":
            return "left-0 origin-top-left top-full mt-2";
        case "top-end":
            return "right-0 origin-bottom-right bottom-full mb-2";
        case "top-start":
            return "left-0 origin-bottom-left bottom-full mb-2";
        default:
            return "right-0 origin-top-right top-full mt-2";
    }
});
</script>

<template>
    <div ref="rootRef" class="relative" v-bind="$attrs">
        <div
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
        <div
            v-show="open"
            role="menu"
            class="absolute z-[50] min-w-[8rem] rounded-md bg-white py-2 shadow-lg ring-1 ring-zinc-900/5 focus:outline-none dark:bg-slate-700"
            :class="[placementClasses, panelClass]"
        >
            <slot />
        </div>
    </div>
</template>
