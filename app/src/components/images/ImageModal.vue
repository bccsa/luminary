<script lang="ts" setup>
// Vue + Types imports
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

// Props definition
type Props = {
    image: ImageDto;
    zoomable?: boolean;
    aspectRatio?: "video" | "square" | "vertical" | "wide" | "classic";
    size?: "small" | "thumbnail" | "post";
    rounded?: boolean;
};

// Set default props
const props = withDefaults(defineProps<Props>(), {
    zoomable: true,
    aspectRatio: "classic",
    size: "post",
});

// Emits
const emit = defineEmits(["close"]);

// References & states
const container = ref<HTMLDivElement | null>(null);
const scale = ref(1); // Zoom scale
const translateX = ref(0); // Horizontal translation (panning)
const translateY = ref(0); // Vertical translation (panning)

let isDragging = false; // Dragging state
let dragStartX = 0,
    dragStartY = 0; // Initial mouse/touch position
let lastX = 0,
    lastY = 0; // Last known translate position

let minScale = 1; // Minimum zoom level
const MAX_SCALE = 5; // Maximum zoom level

// Clamp helper to limit values between min and max
function clamp(val: number, min: number, max: number) {
    return Math.min(Math.max(val, min), max);
}

// Handle Ctrl + mouse wheel zooming
function handleWheel(e: WheelEvent) {
    if (!e.ctrlKey) return; // Zoom only if Ctrl is pressed
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    const newScale = clamp(scale.value + delta, minScale, MAX_SCALE);
    scale.value = newScale;
}

// Handle mouse/touch down (start dragging)
function handlePointerDown(e: PointerEvent) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    lastX = translateX.value;
    lastY = translateY.value;
}

// Handle mouse/touch move (panning logic)
function handlePointerMove(e: PointerEvent) {
    if (!isDragging || !container.value) return;

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    let newX = lastX + dx;
    let newY = lastY + dy;

    // Calculate the scaled image size relative to container
    const containerRect = container.value.getBoundingClientRect();
    const scaledWidth = containerRect.width * scale.value;
    const scaledHeight = containerRect.height * scale.value;

    // Calculate the max allowable pan distance
    const maxX = (scaledWidth - containerRect.width) / 2;
    const maxY = (scaledHeight - containerRect.height) / 2;

    // Clamp the new X/Y to prevent dragging outside container
    newX = clamp(newX, -maxX, maxX);
    newY = clamp(newY, -maxY, maxY);

    translateX.value = newX;
    translateY.value = newY;
}

// Stop dragging
function handlePointerUp() {
    isDragging = false;
}

// ----- Pinch-to-zoom for mobile / touch devices -----
let pinchDistance = 0;

// Compute the distance between two touches
function getDistance(e: TouchEvent) {
    const [touch1, touch2] = e.touches;
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// Track initial pinch distance
function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
        pinchDistance = getDistance(e);
    }
}

// Handle pinch zoom gesture
function handleTouchMove(e: TouchEvent) {
    if (e.touches.length === 2) {
        const newDistance = getDistance(e);
        const delta = (newDistance - pinchDistance) * 0.01;
        const newScale = clamp(scale.value + delta, minScale, MAX_SCALE);
        scale.value = newScale;
        pinchDistance = newDistance;
    }
}

// Emit close event for the modal
const closeModal = () => emit("close");

// Reset zoom and position when image changes
watch(
    () => props.image,
    () => {
        scale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        minScale = 1; // (Optional) Compute based on image/container
    },
    { immediate: true },
);

// Setup event listeners when mounted
onMounted(() => {
    const el = container.value;
    if (!el) return;

    // Listen to Ctrl+wheel zooming
    el.addEventListener("wheel", handleWheel, { passive: false });

    // Setup pointer and touch events
    el.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
});

// Cleanup event listeners
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
    <!-- Fullscreen modal overlay -->
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4 backdrop-blur-sm dark:bg-slate-800 dark:bg-opacity-50"
        @click.self="closeModal"
    >
        <!-- Zoom and pan container -->
        <div
            ref="container"
            class="relative max-h-[1100px] max-w-[1300px] touch-none overflow-hidden rounded-lg bg-gray-900"
        >
            <!-- Transform wrapper for zoom/translate -->
            <div
                class="origin-center transition-transform duration-300 ease-out"
                :style="{
                    transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
                }"
            >
                <!-- Actual image -->
                <LImage
                    :image="image"
                    :aspectRatio="aspectRatio"
                    :size="size"
                    :rounded="rounded"
                    class="pointer-events-none min-h-full min-w-full select-none object-contain"
                    draggable="false"
                />
            </div>
        </div>
    </div>
</template>
