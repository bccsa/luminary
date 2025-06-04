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

// Props
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

let lastDistance = 0;
let initialScale = 1;

const closeModal = () => emit("close");

function getDistance(touches: TouchList): number {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
        lastDistance = getDistance(e.touches);
        initialScale = scale.value;
    }
}

function onTouchMove(e: TouchEvent) {
    if (e.touches.length === 2) {
        e.preventDefault(); // prevent page zoom
        const newDistance = getDistance(e.touches);
        const deltaScale = newDistance / lastDistance;
        scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, initialScale * deltaScale));
    }
}

function handleWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value + delta));
}

watch(
    () => props.image,
    () => {
        scale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        nextTick(() => {});
    },
    { immediate: true },
);

onMounted(() => {
    const el = container.value;
    if (!el) return;

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("wheel", handleWheel, { passive: false });
});

onBeforeUnmount(() => {
    const el = container.value;
    if (!el) return;

    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchmove", onTouchMove);
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
            class="relative flex max-h-[1100px] max-w-[1300px] origin-center touch-none items-center justify-center overflow-hidden rounded-lg bg-gray-900"
            :style="{
                transform: `scale(${scale})`,
                transition: 'transform 0.05s ease-out',
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
/* Necessary to block page zoom behavior on mobile */
html,
body {
    touch-action: none;
    overscroll-behavior: contain;
}
</style>
