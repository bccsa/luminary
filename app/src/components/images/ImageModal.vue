<script setup lang="ts">
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
import { usePinch, useDrag } from "@vueuse/gesture";
import type { ImageDto } from "luminary-shared";

type Props = {
    image: ImageDto;
    zoomable?: boolean;
    aspectRatio?: "video" | "square" | "vertical" | "wide" | "classic";
    size?: "small" | "thumbnail" | "post";
    rounded?: boolean;
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
const MAX_SCALE = 5;
const MIN_SCALE = 1;

function clamp(val: number, min: number, max: number) {
    return Math.min(Math.max(val, min), max);
}

function handleWheel(e: WheelEvent) {
    if (!props.zoomable) return;
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    scale.value = clamp(scale.value + delta, MIN_SCALE, MAX_SCALE);
}

const closeModal = () => emit("close");

// Reset on image change
watch(
    () => props.image,
    () => {
        scale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
    },
    { immediate: true },
);

// Smooth progressive pinch
if (props.zoomable) {
    usePinch(
        ({ delta: [d] }) => {
            scale.value = clamp(scale.value * (1 + d * 0.1), MIN_SCALE, MAX_SCALE);
        },
        {
            domTarget: container,
            eventOptions: { passive: false },
            pointer: { touch: true }, // support touch
        },
    );

    // Drag ONLY when zoomed in
    useDrag(
        ({ offset: [x, y] }) => {
            if (scale.value > 1) {
                translateX.value = x;
                translateY.value = y;
            } else {
                translateX.value = 0;
                translateY.value = 0;
            }
        },
        {
            domTarget: container,
            eventOptions: { passive: true },
            pointer: { touch: true }, // support touch drag
        },
    );
}

onMounted(() => {
    const el = container.value;
    if (!el || !props.zoomable) return;
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
                :image="image"
                :aspectRatio="aspectRatio"
                :size="size"
                :rounded="rounded"
                class="pointer-events-none min-h-full min-w-full select-none object-contain"
            />
        </div>
    </div>
</template>
