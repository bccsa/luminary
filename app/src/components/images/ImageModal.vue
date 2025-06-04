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

const container = ref<HTMLDivElement | null>(null);
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);

const MAX_SCALE = 3;
const MIN_SCALE = 1;
const PADDING = 50;

const isPinching = ref(false);
const isDragging = ref(false);

function clamp(val: number, min: number, max: number) {
    return Math.min(Math.max(val, min), max);
}

function clampTranslation() {
    const el = container.value;
    if (!el || scale.value <= 1) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const containerWidth = el.offsetWidth;
    const containerHeight = el.offsetHeight;

    const scaledWidth = containerWidth * scale.value;
    const scaledHeight = containerHeight * scale.value;

    const maxTranslateX = Math.max((scaledWidth - viewportWidth) / 2 + PADDING, 0);
    const maxTranslateY = Math.max((scaledHeight - viewportHeight) / 2 + PADDING, 0);

    translateX.value = clamp(translateX.value, -maxTranslateX, maxTranslateX);
    translateY.value = clamp(translateY.value, -maxTranslateY, maxTranslateY);
}

function handleWheel(e: WheelEvent) {
    if (!props.image || !e.ctrlKey) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    scale.value = clamp(scale.value + delta, MIN_SCALE, MAX_SCALE);
    clampTranslation();
}

const closeModal = () => emit("close");

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

onMounted(() => {
    const el = container.value;
    if (!el || !props.image) return;

    const isMobile = window.innerWidth < 768;
    if (isMobile) {
        scale.value = 1.5;
        translateX.value = 0;
        translateY.value = 0;
    }

    el.addEventListener("wheel", handleWheel, { passive: false });

    usePinch(
        ({ delta: [d], last }) => {
            if (isDragging.value) return;

            isPinching.value = !last;

            const next = scale.value * (1 + d * 0.1);
            scale.value = clamp(next, MIN_SCALE, MAX_SCALE);
            clampTranslation();
        },
        {
            domTarget: el,
            eventOptions: { passive: false },
            pointer: { touch: true },
        },
    );

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
            clampTranslation();
        },
        {
            domTarget: el,
            eventOptions: { passive: false },
            pointer: { touch: true },
        },
    );
});

onBeforeUnmount(() => {
    const el = container.value;
    if (!el) return;
    el.removeEventListener("wheel", handleWheel);
});
</script>

<template>
    <div
        class="fixed inset-0 z-50 flex touch-none items-center justify-center bg-black bg-opacity-80 p-4 backdrop-blur-sm dark:bg-slate-800 dark:bg-opacity-50"
        @click.self="closeModal"
    >
        <div
            ref="container"
            class="relative flex max-h-[1100px] max-w-[1300px] origin-center items-center justify-center overflow-hidden rounded-lg bg-gray-900 transition-transform duration-300 ease-out"
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

<style scoped>
/* Prevent pinch zoom on body or html globally if needed */
html,
body {
    overscroll-behavior: contain;
    touch-action: none;
}
</style>
