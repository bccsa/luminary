<script lang="ts" setup>
import {
    ref,
    onMounted,
    onBeforeUnmount,
    watch,
    withDefaults,
    defineProps,
    defineEmits,
} from "vue";
import LImage from "./LImage.vue";
import type { ImageDto } from "luminary-shared";

type Props = {
    image: ImageDto;
    zoomable?: boolean;
    aspectRatio?: "video" | "square" | "vertical" | "wide" | "classic";
    size?: "small" | "thumbnail" | "post";
    rounded?: boolean;
    alt?: string;
};

const props = withDefaults(defineProps<Props>(), {
    zoomable: true,
    aspectRatio: "classic",
    size: "post",
});

const emit = defineEmits(["close"]);
const container = ref<HTMLDivElement | null>(null);

const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let lastX = 0;
let lastY = 0;

let minScale = 1; // Dynamic minScale possible later
const MAX_SCALE = 5;

function clamp(val: number, min: number, max: number) {
    return Math.min(Math.max(val, min), max);
}

function handleWheel(e: WheelEvent) {
    if (!e.ctrlKey) return; // Only zoom if CTRL is pressed
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    const newScale = clamp(scale.value + delta, minScale, MAX_SCALE);
    scale.value = newScale;
}

function handlePointerDown(e: PointerEvent) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    lastX = translateX.value;
    lastY = translateY.value;
}

function handlePointerMove(e: PointerEvent) {
    if (!isDragging || !container.value) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    let newX = lastX + dx;
    let newY = lastY + dy;

    // Clamp dragging based on scaled content size
    const containerRect = container.value.getBoundingClientRect();
    const scaledWidth = containerRect.width * scale.value;
    const scaledHeight = containerRect.height * scale.value;

    const maxX = (scaledWidth - containerRect.width) / 2;
    const maxY = (scaledHeight - containerRect.height) / 2;

    newX = clamp(newX, -maxX, maxX);
    newY = clamp(newY, -maxY, maxY);

    translateX.value = newX;
    translateY.value = newY;
}

function handlePointerUp() {
    isDragging = false;
}

// Pinch-to-zoom handling
let pinchDistance = 0;
function getDistance(e: TouchEvent) {
    const [touch1, touch2] = e.touches;
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
        pinchDistance = getDistance(e);
    }
}

function handleTouchMove(e: TouchEvent) {
    if (e.touches.length === 2) {
        const newDistance = getDistance(e);
        const delta = (newDistance - pinchDistance) * 0.01;
        const newScale = clamp(scale.value + delta, minScale, MAX_SCALE);
        scale.value = newScale;
        pinchDistance = newDistance;
    }
}

const closeModal = () => emit("close");

// Reset zoom state when a new image is shown
watch(
    () => props.image,
    () => {
        scale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        minScale = 1; // Can compute dynamically if needed
    },
    { immediate: true },
);

onMounted(() => {
    const el = container.value;
    if (!el) return;

    // Wheel zoom ONLY with ctrl pressed
    el.addEventListener("wheel", handleWheel, { passive: false });

    el.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
});

onBeforeUnmount(() => {
    const el = container.value;
    if (!el) return;

    el.removeEventListener("wheel", handleWheel);
    el.removeEventListener("pointerdown", handlePointerDown);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    el.removeEventListener("touchstart", handleTouchStart);
    el.removeEventListener("touchmove", handleTouchMove);
});
</script>

<template>
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4 backdrop-blur-sm dark:bg-slate-800 dark:bg-opacity-50"
        @click.self="closeModal"
    >
        <div
            ref="container"
            class="relative max-h-[1100px] max-w-[1300px] touch-none overflow-hidden rounded-lg bg-gray-900"
        >
            <div
                class="origin-center transition-transform duration-300 ease-out"
                :style="{
                    transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
                }"
            >
                <LImage
                    :image="image"
                    :aspectRatio="aspectRatio"
                    :size="size"
                    :rounded="rounded"
                    :alt="alt"
                    class="pointer-events-none min-h-full min-w-full select-none object-contain"
                    draggable="false"
                />
            </div>
        </div>
    </div>
</template>
