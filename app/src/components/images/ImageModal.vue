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
    computed,
} from "vue";
import LImage from "./LImage.vue";
import type { ImageDto, Uuid } from "luminary-shared";
import {
    XCircleIcon,
    MagnifyingGlassMinusIcon,
    MagnifyingGlassPlusIcon,
} from "@heroicons/vue/24/outline";

// Props
type Props = {
    imageCollections: ImageFileCollectionDto[];
    currentIndex: number;
    contentParentId: Uuid;
    aspectRatio?: "video" | "square" | "vertical" | "wide" | "classic";
    size?: "small" | "thumbnail" | "post";
    rounded?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    aspectRatio: "classic",
    size: "post",
});

const emit = defineEmits(["close", "update:index"]);

const currentImage = computed(() => {
    return {
        fileCollections: [props.imageCollections[props.currentIndex]],
    } as ImageDto;
});

const container = ref<HTMLDivElement | null>(null);
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);

const MAX_SCALE = ref(2); // default desktop
const MIN_SCALE = 1;
const PADDING = 50;
const ZOOM_STEP = 0.2; // Incremental zoom step for +/-

let lastDistance = 0;
let initialScale = 1;

let isTouchDragging = false;
let lastTouch = { x: 0, y: 0 };

let isMouseDragging = false;
let lastMouse = { x: 0, y: 0 };

let swipeStartX = 0;
let swipeEndX = 0;
const swipeThreshold = 50;
let pinchZooming = false;
let draggingImage = false;

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
    if (e.touches.length === 1) {
        swipeStartX = e.touches[0].clientX;
    }

    if (e.touches.length === 2) {
        lastDistance = getDistance(e.touches);
        initialScale = scale.value;
        isTouchDragging = false;
        pinchZooming = true;
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

function onTouchEnd(e: TouchEvent) {
    if (pinchZooming) {
        pinchZooming = false;
        return; // Don't swipe after a pinch gesture
    }

    if (e.changedTouches?.[0]) {
        swipeEndX = e.changedTouches[0].clientX;
        handleSwipeGesture();
    }

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

function onDblClick(e: MouseEvent | TouchEvent) {
    const el = container.value;
    if (!el) return;

    let clientX: number, clientY: number;

    if (e instanceof TouchEvent) {
        const touch = e.changedTouches[0]; // ← changedTouches instead of touches
        clientX = touch.clientX;
        clientY = touch.clientY;
    } else if (e instanceof MouseEvent) {
        clientX = e.clientX;
        clientY = e.clientY;
    } else {
        return;
    }

    if (scale.value > 1) {
        scale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
    } else {
        scale.value = MAX_SCALE.value;
        const rect = el.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const offsetX = clientX - rect.left - centerX;
        const offsetY = clientY - rect.top - centerY;

        translateX.value = -offsetX * (MAX_SCALE.value - 1);
        translateY.value = -offsetY * (MAX_SCALE.value - 1);
        clampTranslation();
    }
}

function onSwipe(direction: "left" | "right") {
    const total = props.imageCollections.length;
    const newIndex =
        direction === "left"
            ? (props.currentIndex + 1) % total
            : (props.currentIndex - 1 + total) % total;
    emit("update:index", newIndex);
}

// Double-tap support for mobile
let lastTap = 0;
function onTouchEndWithDoubleTap(e: TouchEvent) {
    const now = Date.now();
    if (now - lastTap < 400) {
        onDblClick(e);
        lastTap = 0;
    } else {
        lastTap = now;
    }
    onTouchEnd(e);
}

function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") onSwipe("right");
    else if (event.key === "ArrowRight") onSwipe("left");
    else if (event.key === "Escape") closeModal();
}

// Watch image change
watch(
    () => currentImage,
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
    if (isMobile && props.imageCollections.length == 1) {
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
    el.addEventListener("touchend", onTouchEndWithDoubleTap);
    el.addEventListener("touchcancel", onTouchEndWithDoubleTap);

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
    el.removeEventListener("touchend", onTouchEndWithDoubleTap);
    el.removeEventListener("touchcancel", onTouchEndWithDoubleTap);

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
        class="fixed inset-0 z-50 flex w-full items-center justify-center bg-black bg-opacity-80 p-4 backdrop-blur-sm dark:bg-slate-800 dark:bg-opacity-50"
        @click.self="closeModal"
    >
        <XCircleIcon
            class="fixed right-8 top-8 z-40 h-10 w-10 cursor-pointer rounded-full bg-gray-900 bg-opacity-70 p-2 text-white drop-shadow-lg hover:text-gray-300 dark:text-slate-200 dark:hover:text-slate-100 md:h-10 md:w-10 md:p-1"
            @click.stop="closeModal"
        />
        <div class="fixed bottom-8 right-8 z-40 flex flex-row gap-2">
            <MagnifyingGlassMinusIcon
                class="h-10 w-10 cursor-pointer rounded-full bg-gray-900 bg-opacity-70 p-2 text-white drop-shadow-lg hover:text-gray-300 dark:text-slate-200 dark:hover:text-slate-100 md:h-10 md:w-10 md:p-1"
                @click.stop="zoomOut"
            />
            <MagnifyingGlassPlusIcon
                class="h-10 w-10 cursor-pointer rounded-full bg-gray-900 bg-opacity-70 p-2 text-white drop-shadow-lg hover:text-gray-300 dark:text-slate-200 dark:hover:text-slate-100 md:h-10 md:w-10 md:p-1"
                @click.stop="zoomIn"
            />
        </div>
        <div
            ref="container"
            class="relative flex origin-center touch-none select-none items-center justify-center overflow-hidden rounded-lg"
            :style="{
                transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
                transition: isMouseDragging || isTouchDragging ? 'none' : 'transform 0.1s ease-out',
                cursor: scale > 1 ? (isMouseDragging ? 'grabbing' : 'grab') : 'default',
                width: 'fit-content',
                height: 'fit-content',
                maxWidth: '90vw',
                maxHeight: '90vh',
            }"
        >
            <LImage
                :contentParentId="contentParentId"
                :image="currentImage"
                :size="size"
                :rounded="false"
                :is-modal="true"
                class="pointer-events-none"
            />

            <div v-if="imageCollections.length > 1">
                <ArrowLeftCircleIcon
                    class="absolute left-1 top-1/2 z-40 h-12 w-12 -translate-y-1/2 cursor-pointer text-zinc-300 sm:block"
                    @click="onSwipe('right')"
                />

                <ArrowRightCircleIcon
                    class="absolute right-1 top-1/2 h-12 w-12 -translate-y-1/2 cursor-pointer text-zinc-300 sm:block"
                    @click="onSwipe('left')"
                />
            </div>

            <div
                v-if="imageCollections.length > 1"
                data-role="dot"
                class="absolute bottom-2 left-1/2 z-50 flex -translate-x-1/2 gap-1"
            >
                <span
                    v-for="(img, idx) in imageCollections"
                    :key="idx"
                    class="h-2 w-2 rounded-full"
                    :class="[
                        idx === props.currentIndex ? 'bg-zinc-300' : 'bg-zinc-700',
                        'cursor-pointer transition-all duration-300',
                    ]"
                    @click="emit('update:index', idx)"
                ></span>
            </div>
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
