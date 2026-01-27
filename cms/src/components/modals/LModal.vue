<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { onClickOutside } from "@vueuse/core";
import LTeleport from "../common/LTeleport.vue";

type Props = {
    heading: string;
    noDivider?: boolean;
};
withDefaults(defineProps<Props>(), {
    noDivider: false,
});

const isVisible = defineModel<boolean>("isVisible");

const modalRef = ref<HTMLElement>();

onClickOutside(modalRef, () => {
    isVisible.value = false;
});

onMounted(() => {
    const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && isVisible.value) {
            isVisible.value = false;
        }
    };
    document.addEventListener('keydown', handleEscape);
    onUnmounted(() => {
        document.removeEventListener('keydown', handleEscape);
    });
});
</script>

<template>
    <LTeleport v-if="isVisible">
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-800 bg-opacity-50 p-2 backdrop-blur-sm"
        >
            <!-- Modal content at higher z-index -->
            <div
                ref="modalRef"
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
