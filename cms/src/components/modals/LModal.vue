<script setup lang="ts">
import { ref, watch } from "vue";
import LTeleport from "../common/LTeleport.vue";

type Props = {
    heading: string;
    noDivider?: boolean;
};
withDefaults(defineProps<Props>(), {
    noDivider: false,
});

const isVisible = defineModel<boolean>("isVisible");

const modalRef = ref<HTMLElement | null>(null);
const mouseDownOutsideContent = ref(false);

watch(modalRef, (el) => {
    if (el) {
        el.focus();
    }
});

function isOutsideModalContent(target: EventTarget | null): boolean {
    const el = target as Node | null;
    return !!el && !!modalRef.value && !modalRef.value.contains(el);
}

function onBackdropMousedown(e: MouseEvent) {
    mouseDownOutsideContent.value = isOutsideModalContent(e.target);
}

function onBackdropClick(e: MouseEvent) {
    if (mouseDownOutsideContent.value && isOutsideModalContent(e.target)) {
        isVisible.value = false;
    }
    mouseDownOutsideContent.value = false;
}

function onContentMousedown() {
    mouseDownOutsideContent.value = false;
}
</script>

<template>
    <LTeleport v-if="isVisible">
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-800 bg-opacity-50 p-2 backdrop-blur-sm"
            @mousedown="onBackdropMousedown"
            @click="onBackdropClick"
        >
            <!-- Modal content at higher z-index -->
            <div
                tabindex="0"
                @keydown.esc="isVisible = false"
                @mousedown="onContentMousedown"
                @click.stop
                ref="modalRef"
                class="relative z-50 max-h-screen w-full max-w-md rounded-lg bg-white/90 p-5 shadow-xl focus:outline-none"
            >
                <h2 class="mb-4 px-1 text-lg font-semibold">{{ heading }}</h2>
                <div :class="noDivider ? '' : 'divide-y divide-zinc-200'">
                    <slot />
                </div>

                <div v-if="$slots.footer" class="shrink-0 pb-5 pt-4">
                    <slot name="footer"></slot>
                </div>
            </div>
        </div>
    </LTeleport>
</template>
