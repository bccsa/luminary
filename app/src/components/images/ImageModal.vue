<script setup lang="ts">
import {
    ref,
    onMounted,
    onBeforeUnmount,
    watch,
    withDefaults,
    defineProps,
    defineEmits,
    nextTick,
} from "vue";
import LImage from "./LImage.vue";
import type { ImageDto, Uuid } from "luminary-shared";
import { XCircleIcon } from "@heroicons/vue/24/outline";

// Props
type Props = {
    image?: ImageDto;
    contentParentId: Uuid;
    aspectRatio?: "video" | "square" | "vertical" | "wide" | "classic";
    size?: "small" | "thumbnail" | "post";
    rounded?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    aspectRatio: "classic",
    size: "post",
});

const emit = defineEmits(["close"]);

const container = ref<HTMLDivElement | null>(null);
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);

const MAX_SCALE = ref(2); // default desktop
const MIN_SCALE = 1;
const PADDING = 50;

let lastDistance = 0;
let initialScale = 1;

let isTouchDragging = false;
let lastTouch = { x: 0, y: 0 };

let isMouseDragging = false;
let lastMouse = { x: 0, y: 0 };

const closeModal = () => emit("close");

function clamp(val: number, min: number, max: number) {
    return Math.min(Math.max(val, min), max);
}

function getDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function clampTranslation() {
    const el = container.value;
    if (!el || scale.value <= 1) {
        translateX.value = 0;
        translateY.value = 0;
        return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const elWidth = el.offsetWidth;
    const elHeight = el.offsetHeight;

    const scaledWidth = elWidth * scale.value;
    const scaledHeight = elHeight * scale.value;

    const maxX = Math.max((scaledWidth - viewportWidth) / 2 + PADDING, 0);
    const maxY = Math.max((scaledHeight - viewportHeight) / 2 + PADDING, 0);

    translateX.value = clamp(translateX.value, -maxX, maxX);
    translateY.value = clamp(translateY.value, -maxY, maxY);
}

// Touch events
function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
        lastDistance = getDistance(e.touches);
        initialScale = scale.value;
        isTouchDragging = false;
    } else if (e.touches.length === 1 && scale.value > 1) {
        lastTouch = {
            x: e.touches[0].clientX - translateX.value,
            y: e.touches[0].clientY - translateY.value,
        };
        isTouchDragging = true;
    }
}

function onTouchMove(e: TouchEvent) {
    if (e.touches.length === 2) {
        e.preventDefault();
        isTouchDragging = false;
        const newDistance = getDistance(e.touches);
        const deltaScale = newDistance / lastDistance;
        scale.value = clamp(initialScale * deltaScale, MIN_SCALE, MAX_SCALE.value);
        clampTranslation();
    } else if (e.touches.length === 1 && isTouchDragging) {
        e.preventDefault();
        translateX.value = e.touches[0].clientX - lastTouch.x;
        translateY.value = e.touches[0].clientY - lastTouch.y;
        clampTranslation();
    }
}

function onTouchEnd() {
    isTouchDragging = false;
}

// Mouse events
function onMouseDown(e: MouseEvent) {
    if (scale.value <= 1) return;
    isMouseDragging = true;
    lastMouse = {
        x: e.clientX - translateX.value,
        y: e.clientY - translateY.value,
    };
}

function onMouseMove(e: MouseEvent) {
    if (!isMouseDragging) return;
    translateX.value = e.clientX - lastMouse.x;
    translateY.value = e.clientY - lastMouse.y;
    clampTranslation();
}

function onMouseUp() {
    isMouseDragging = false;
}

function handleWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.05;
    const newScale = clamp(scale.value + delta, MIN_SCALE, MAX_SCALE.value);
    if (Math.abs(newScale - scale.value) > 0.001) {
        scale.value = newScale;
        clampTranslation();
    }
}

function onDblClick(e: MouseEvent) {
    const el = container.value;
    if (!el) return;

    if (scale.value > 1) {
        scale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
    } else {
        scale.value = MAX_SCALE.value;
        const rect = el.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const offsetX = e.clientX - rect.left - centerX;
        const offsetY = e.clientY - rect.top - centerY;

        translateX.value = -offsetX * (MAX_SCALE.value - 1);
        translateY.value = -offsetY * (MAX_SCALE.value - 1);
        clampTranslation();
    }
}

function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
        closeModal();
    }
}

// Watch image change
watch(
    () => props.image,
    () => {
        scale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        nextTick(() => clampTranslation());
    },
    { immediate: true },
);

// Setup on mount
onMounted(() => {
    const el = container.value;
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        MAX_SCALE.value = 3;
        if (scale.value === 1) {
            scale.value = 1.4;
            translateX.value = 0;
            translateY.value = 0;
            clampTranslation();
        }
    }

    if (!el) return;

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    el.addEventListener("wheel", handleWheel, { passive: false });

    el.addEventListener("dblclick", onDblClick);

    window.addEventListener("keydown", onKeyDown);
});

onBeforeUnmount(() => {
    const el = container.value;
    if (!el) return;

    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchmove", onTouchMove);
    el.removeEventListener("touchend", onTouchEnd);
    el.removeEventListener("touchcancel", onTouchEnd);

    el.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);

    el.removeEventListener("wheel", handleWheel);

    el.removeEventListener("dblclick", onDblClick);

    window.removeEventListener("keydown", onKeyDown);
});
</script>

<template>
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4 backdrop-blur-sm dark:bg-slate-800 dark:bg-opacity-50"
        @click.self="closeModal"
    >
        <div>
            <XCircleIcon
                class="absolute right-4 top-4 h-10 w-10 cursor-pointer text-white hover:text-gray-300 dark:text-slate-200 dark:hover:text-slate-100"
                @click.stop="closeModal"
            />
        </div>
        <div
            ref="container"
            class="relative flex max-h-[1100px] max-w-[1300px] origin-center touch-none select-none items-center justify-center overflow-hidden rounded-lg bg-gray-900"
            :style="{
                transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
                transition: isMouseDragging || isTouchDragging ? 'none' : 'transform 0.1s ease-out',
                cursor: scale > 1 ? (isMouseDragging ? 'grabbing' : 'grab') : 'default',
            }"
        >
            <LImage
                :contentParentId="contentParentId"
                :image="image"
                :aspectRatio="aspectRatio"
                :size="size"
                :rounded="rounded"
                class="pointer-events-none min-h-full min-w-full object-contain"
            />
        </div>
    </div>
</template>

<style scoped>
html,
body {
    touch-action: none;
    overscroll-behavior: contain;
}
</style>
