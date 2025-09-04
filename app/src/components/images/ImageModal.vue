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
import type { ImageDto, ImageFileCollectionDto, Uuid } from "luminary-shared";
import {
    XCircleIcon,
    MagnifyingGlassMinusIcon,
    MagnifyingGlassPlusIcon,
    ArrowLeftCircleIcon,
    ArrowRightCircleIcon,
} from "@heroicons/vue/24/outline";

// Props
type Props = {
    imageCollections?: ImageFileCollectionDto[];
    currentIndex?: number;
    image?: ImageDto; // for single image mode
    contentParentId: Uuid;
    aspectRatio?: "video" | "square" | "vertical" | "wide" | "classic" | "original";
    size?: "small" | "thumbnail" | "post";
    rounded?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    aspectRatio: "classic",
    size: "post",
    currentIndex: 0,
});

const emit = defineEmits(["close", "update:index"]);

const hasMultiple = computed(() => props.imageCollections && props.imageCollections.length > 1);

const currentImage = computed(() => {
    if (props.imageCollections) {
        return {
            fileCollections: [props.imageCollections[props.currentIndex]],
        } as ImageDto;
    }
    return props.image;
});

const container = ref<HTMLDivElement | null>(null);
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);

const MAX_SCALE = ref(2); // default desktop
const MIN_SCALE = 1;
const PADDING = 50;
const ZOOM_STEP = 0.2;

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

function zoomIn() {
    scale.value = clamp(scale.value + ZOOM_STEP, MIN_SCALE, MAX_SCALE.value);
    clampTranslation();
}

function zoomOut() {
    scale.value = clamp(scale.value - ZOOM_STEP, MIN_SCALE, MAX_SCALE.value);
    clampTranslation();
}

function handleSwipeGesture() {
    if (!hasMultiple.value || scale.value > 1) return;
    const deltaX = swipeEndX - swipeStartX;
    if (Math.abs(deltaX) > swipeThreshold) {
        if (deltaX > 0) onSwipe("right");
        else onSwipe("left");
    }
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

// Double-tap support
let lastTap = 0;
function onTouchEndWithDoubleTap(e: TouchEvent) {
    const now = Date.now();
    const isDoubleTap = now - lastTap < 400;
    lastTap = now;

    if (isDoubleTap) {
        e.preventDefault();
        onDblClick(e);
        lastTap = 0;
    } else {
        onTouchEnd(e);
    }
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
        const touch = e.changedTouches[0];
        clientX = touch.clientX;
        clientY = touch.clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
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
    if (!props.imageCollections || props.imageCollections.length <= 1) return;
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    const total = props.imageCollections.length;
    const newIndex =
        direction === "left"
            ? (props.currentIndex + 1) % total
            : (props.currentIndex - 1 + total) % total;
    emit("update:index", newIndex);
}

function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") onSwipe("right");
    else if (event.key === "ArrowRight") onSwipe("left");
    else if (event.key === "Escape") closeModal();
}

const arrowSizeClass = computed(() => "h-10 w-10 xs:h-12 xs:w-12 sm:h-14 sm:w-14");

// Reset state on image change
watch(
    () => currentImage.value,
    () => {
        scale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        nextTick(() => clampTranslation());
    },
    { immediate: true },
);

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
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4 backdrop-blur-sm dark:bg-slate-800 dark:bg-opacity-50"
        @click.self="closeModal"
    >
        <!-- Close -->
        <XCircleIcon
            class="fixed right-8 top-8 z-40 h-10 w-10 cursor-pointer rounded-full bg-gray-900 bg-opacity-70 p-2 text-white drop-shadow-lg hover:text-gray-300 dark:text-slate-200 dark:hover:text-slate-100 md:h-10 md:w-10 md:p-1"
            @click.stop="closeModal"
        />

        <!-- Zoom controls -->
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
            <!-- Content -->
            <div class="relative flex w-full max-w-[1350px] items-center justify-center">
                <div v-if="imageCollections && imageCollections.length > 1">
                    <!-- Arrows -->
                    <ArrowLeftCircleIcon
                        v-if="hasMultiple"
                        class="absolute left-2 top-1/2 z-40 hidden -translate-y-1/2 cursor-pointer rounded-full bg-gray-900 text-white drop-shadow-lg transition hover:scale-110 sm:left-4 md:left-[-64px] md:block"
                        :class="arrowSizeClass"
                        @click="onSwipe('right')"
                    />
                    <ArrowRightCircleIcon
                        v-if="hasMultiple"
                        class="absolute right-2 top-1/2 z-40 hidden -translate-y-1/2 cursor-pointer rounded-full bg-gray-900 text-white drop-shadow-lg transition hover:scale-110 sm:right-4 md:right-[-64px] md:block"
                        :class="arrowSizeClass"
                        @click="onSwipe('left')"
                    />
                </div>
            </div>

            <!-- Dots -->
            <div
                v-if="hasMultiple"
                class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center justify-center gap-2"
            >
                <span
                    v-for="(img, idx) in imageCollections"
                    :key="idx"
                    class="h-2 w-2 rounded-full"
                    :class="[
                        idx === props.currentIndex ? 'h-3 w-3 bg-white' : 'bg-gray-500',
                        'cursor-pointer transition-all duration-300',
                    ]"
                    @click="
                        () => {
                            scale = 1;
                            translateX = 0;
                            translateY = 0;
                            emit('update:index', idx);
                        }
                    "
                ></span>
            </div>
        </div>
    </div>
</template>
