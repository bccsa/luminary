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
import { usePinch, useDrag } from "@vueuse/gesture";
import type { ImageDto, Uuid } from "luminary-shared";

// Props definition
type Props = {
    image: ImageDto;
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

// Refs for DOM and transformations
const container = ref<HTMLDivElement | null>(null);
const scale = ref(1); // current zoom level
const translateX = ref(0); // horizontal drag offset
const translateY = ref(0); // vertical drag offset

// Clamp limits
const MAX_SCALE = 3;
const MIN_SCALE = 1;
const PADDING = 50; // image can't go more than 50px offscreen

// Lock states to prevent drag+pinch at same time
const isPinching = ref(false);
const isDragging = ref(false);

// Clamp helper
function clamp(val: number, min: number, max: number) {
    return Math.min(Math.max(val, min), max);
}

// Clamp translation so image edge doesn't go past viewport by more than PADDING
function clampTranslation() {
    const el = container.value;
    if (!el || scale.value <= 1) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const containerWidth = el.offsetWidth;
    const containerHeight = el.offsetHeight;

    const scaledWidth = containerWidth * scale.value;
    const scaledHeight = containerHeight * scale.value;

    // Max allowed translation so the scaled image doesn't go offscreen more than PADDING

    const maxTranslateX = Math.max((scaledWidth - viewportWidth) / 2 + PADDING, 0);
    const maxTranslateY = Math.max((scaledHeight - viewportHeight) / 2 + PADDING, 0);

    translateX.value = clamp(translateX.value, -maxTranslateX, maxTranslateX);
    translateY.value = clamp(translateY.value, -maxTranslateY, maxTranslateY);
}

// Handle zoom via mouse wheel + ctrl
function handleWheel(e: WheelEvent) {
    if (!props.image || !e.ctrlKey) return;
    e.preventDefault();

    const delta = -e.deltaY * 0.002;
    scale.value = clamp(scale.value + delta, MIN_SCALE, MAX_SCALE);

    clampTranslation();
}

// Emit close on backdrop click
const closeModal = () => emit("close");

// Reset zoom/translation on new image
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

// Handle pinch zoom (touch)
// Only active if not currently dragging
if (props.image) {
    usePinch(
        ({ delta: [d], last }) => {
            if (isDragging.value) return;

            isPinching.value = !last;

            const next = scale.value * (1 + d * 0.1);
            scale.value = clamp(next, MIN_SCALE, MAX_SCALE);
            clampTranslation();
        },
        {
            domTarget: container,
            eventOptions: { passive: false },
            pointer: { touch: true },
        },
    );

    // Handle drag translation
    // Only active when zoomed AND not pinching
    useDrag(
        ({ offset: [x, y], last }) => {
            if (scale.value <= 1 || isPinching.value) {
                translateX.value = 0;
                translateY.value = 0;
                return;
            }

            isDragging.value = !last;

            translateX.value = x;
            translateY.value = y;

            clampTranslation(); // always re-validate limits
        },
        {
            domTarget: container,
            eventOptions: { passive: false }, // must be false to prevent touch scroll issues
            pointer: { touch: true },
        },
    );
}

// Add/remove mouse wheel zoom on mount/unmount
onMounted(() => {
    const el = container.value;
    if (!el || !props.image) return;

    const isMobile = window.innerWidth < 768;

    // zoomed image when opened on mobile
    if (isMobile) {
        scale.value = 1.5;
        translateX.value = 0;
        translateY.value = 0;
    }

    // Add wheel event listener for zooming
    el.addEventListener("wheel", handleWheel, { passive: false });
});

onBeforeUnmount(() => {
    const el = container.value;
    if (!el) return;
    el.removeEventListener("wheel", handleWheel);
});
</script>

<template>
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4 backdrop-blur-sm dark:bg-slate-800 dark:bg-opacity-50"
        @click.self="closeModal"
    >
        <div
            ref="container"
            class="relative flex max-h-[1100px] max-w-[1300px] origin-center touch-none items-center justify-center overflow-hidden rounded-lg bg-gray-900 transition-transform duration-300 ease-out"
            :style="{
                transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
            }"
        >
            <LImage
                :contentParentId="contentParentId"
                :image="image"
                :aspectRatio="aspectRatio"
                :size="size"
                :rounded="rounded"
                class="pointer-events-none min-h-full min-w-full select-none object-contain"
            />
        </div>
    </div>
</template>
