<script setup lang="ts">
import { ref, computed } from "vue";
import LTeleport from "../common/LTeleport.vue";

type Props = {
    heading: string;
    noDivider?: boolean;
};
withDefaults(defineProps<Props>(), {
    noDivider: false,
});

const isVisible = defineModel<boolean>("isVisible");

// Tracks whether the mouse down event occurred on the modal background.
const mouseDownOnBackground = ref(false);

const modalClasses = computed(() => [
    "relative z-50 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-lg bg-white/90 shadow-xl",
    props.adaptiveSize ? "max-w-fit" : "max-w-md",
]);

const contentClasses = computed(() => ["flex-1 overflow-auto", props.noPadding ? "" : "px-5"]);

function handleMouseDown(e: MouseEvent) {
    // Only set true if mousedown is on the background (outer div)
    if (e.target === e.currentTarget) {
        mouseDownOnBackground.value = true;
    } else {
        mouseDownOnBackground.value = false;
    }
}

function handleMouseUp(e: MouseEvent) {
    // Only close if both mousedown and mouseup are on the background
    if (mouseDownOnBackground.value && e.target === e.currentTarget) {
        isVisible.value = false;
    }
    mouseDownOnBackground.value = false;
}
</script>

<template>
    <LTeleport v-if="isVisible">
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-800 bg-opacity-50 p-2 backdrop-blur-sm"
            @mousedown="handleMouseDown"
            @mouseup="handleMouseUp"
        >
            <!-- Modal content at higher z-index -->
            <div
                class="relative z-50 max-h-screen w-full max-w-md rounded-lg bg-white/90 p-5 shadow-xl"
            >
                <h2 class="mb-4 text-lg font-semibold">{{ heading }}</h2>
                <div :class="noDivider ? '' : 'divide-y divide-zinc-200'">
                    <slot></slot>
                </div>

                <div v-if="$slots.footer" class="shrink-0 px-5 pb-5 pt-4">
                    <slot name="footer"></slot>
                </div>
            </div>
        </div>
    </LTeleport>
</template>
