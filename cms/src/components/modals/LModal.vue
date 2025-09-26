<script setup lang="ts">
import { ref } from "vue";
import LTeleport from "../common/LTeleport.vue";

type Props = {
    heading: string;
};
defineProps<Props>();

const isVisible = defineModel<boolean>("isVisible");

const mouseDownOnBackground = ref(false);

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
                <div class="divide-y divide-zinc-200">
                    <slot></slot>
                </div>
                <div class="mt-4">
                    <slot name="footer"></slot>
                </div>
            </div>
        </div>
    </LTeleport>
</template>
