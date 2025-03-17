<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import type { ImageDto } from "luminary-shared";
import LImage from "./LImage.vue";

type Props = {
    image: ImageDto;
    rounded?: boolean;
    size: "post" | "small" | "thumbnail";
    aspectRatio: "video" | "square" | "vertical" | "wide" | "classic";
    zoomable?: boolean;
};

const props = defineProps<Props>();
const emit = defineEmits(["close"]);

const scale = ref(1);
const position = ref({ x: 0, y: 0 });
const isDragging = ref(false);
const lastMousePosition = ref({ x: 0, y: 0 });
const initialDistance = ref(0);

// Close modal only if clicking outside the image
const closeModal = (event: Event) => {
    if ((event.target as HTMLElement).closest(".image-container")) return;
    emit("close");
};

// ** Fix: Trackpad & Wheel Zoom (Centers at Cursor) **
const onWheel = (event: WheelEvent) => {
    if (!props.zoomable) return;
    event.preventDefault();

    const zoomIntensity = 0.2;
    const maxZoom = window.innerWidth > 768 ? 2.5 : 4;

    // Get cursor position relative to image
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const prevScale = scale.value;

    // ** Detect trackpad pinch-to-zoom (Mac) **
    if (event.ctrlKey) {
        scale.value = Math.min(
            Math.max(scale.value - event.deltaY * zoomIntensity * 0.01, 1),
            maxZoom,
        );
    } else {
        scale.value = Math.min(
            Math.max(scale.value - event.deltaY * zoomIntensity * 0.01, 1),
            maxZoom,
        );
    }

    // Adjust position so zoom stays centered at cursor
    const scaleRatio = scale.value / prevScale;
    position.value.x -= (offsetX - position.value.x) * (scaleRatio - 1);
    position.value.y -= (offsetY - position.value.y) * (scaleRatio - 1);
};

// ** Fix: Mobile Pinch-to-Zoom Support **
const onTouchStart = (event: TouchEvent) => {
    if (!props.zoomable) return;
    if (event.touches.length === 2) {
        event.preventDefault();
        const [touch1, touch2] = event.touches;
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        initialDistance.value = Math.sqrt(dx * dx + dy * dy);
    } else {
        startDrag(event);
    }
};

const onTouchMove = (event: TouchEvent) => {
    if (!props.zoomable || event.touches.length < 2) return;
    event.preventDefault();

    const [touch1, touch2] = event.touches;
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    const newDistance = Math.sqrt(dx * dx + dy * dy);

    const scaleFactor = newDistance / initialDistance.value;
    const maxZoom = window.innerWidth > 768 ? 2.5 : 4;
    scale.value = Math.min(Math.max(scale.value * scaleFactor, 1), maxZoom);
    initialDistance.value = newDistance;
};

// ** Dragging Logic **
const startDrag = (event: MouseEvent | TouchEvent) => {
    if (!props.zoomable || scale.value === 1) return;
    isDragging.value = true;

    if (event instanceof MouseEvent) {
        lastMousePosition.value = { x: event.clientX, y: event.clientY };
    } else {
        lastMousePosition.value = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
};

const onDrag = (event: MouseEvent | TouchEvent) => {
    if (!isDragging.value || scale.value === 1) return;

    let clientX, clientY;
    if (event instanceof MouseEvent) {
        clientX = event.clientX;
        clientY = event.clientY;
    } else {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    }

    const dx = clientX - lastMousePosition.value.x;
    const dy = clientY - lastMousePosition.value.y;

    position.value.x += dx;
    position.value.y += dy;

    lastMousePosition.value = { x: clientX, y: clientY };
};

// Stop dragging
const stopDrag = () => {
    isDragging.value = false;
};

onMounted(() => {
    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchend", stopDrag);
});

onUnmounted(() => {
    window.removeEventListener("mouseup", stopDrag);
    window.removeEventListener("touchend", stopDrag);
});
</script>

<template>
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4 backdrop-blur-sm dark:bg-slate-800 dark:bg-opacity-50"
        @click="closeModal"
    >
        <div
            class="relative flex h-full w-full touch-none items-center justify-center overflow-hidden"
        >
            <div
                class="image-container absolute flex w-full touch-pinch-zoom items-center justify-center overflow-hidden"
                @click.stop
                @wheel.prevent="onWheel"
                @mousedown="startDrag"
                @mousemove="onDrag"
                @mouseup="stopDrag"
                @touchstart="onTouchStart"
                @touchmove="onDrag"
                @touchend="stopDrag"
                @touchmove.passive="onTouchMove"
                :style="{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    width: `${scale * 90}%`,
                    height: `${scale * 90}%`,
                    maxWidth: '90vw',
                    maxHeight: '90vh',
                }"
            >
                <LImage
                    :image="image"
                    alt="Zoomed Image"
                    :rounded="rounded"
                    :aspectRatio="aspectRatio"
                    size="post"
                    draggable="false"
                    zoomable
                    style="max-width: unset; max-height: unset"
                />
            </div>
        </div>
    </div>
</template>
