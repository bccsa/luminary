<script setup lang="ts">
import { ref, watch } from "vue";
import LTeleport from "../common/LTeleport.vue";

type Props = {
    heading: string;
    noDivider?: boolean;
    shadowOnFooter?: boolean;
    fullScreen?: boolean;
};
withDefaults(defineProps<Props>(), {
    noDivider: false,
});

const isVisible = defineModel<boolean>("isVisible");

const modalRef = ref<HTMLElement>();

watch(modalRef, (el) => {
    if (el) {
        el.focus();
    }
});
</script>

<template>
    <LTeleport v-if="isVisible">
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-800 bg-opacity-50 p-2 backdrop-blur-sm"
            @click="isVisible = false"
        >
            <!-- Modal content at higher z-index -->
            <div
                tabindex="0"
                @keydown.esc="isVisible = false"
                @click.stop
                ref="modalRef"
                :class="
                    fullScreen
                        ? 'relative z-50 flex max-h-[95vh] max-w-[90vw] flex-col rounded-lg bg-white/90 shadow-xl focus:outline-none'
                        : 'relative z-50 max-h-screen w-full max-w-md rounded-lg bg-white/90 p-5 shadow-xl focus:outline-none'
                "
            >
                <div class="flex-1 overflow-scroll p-5 scrollbar-hide">
                    <h2 class="mb-4 px-1 text-lg font-semibold">{{ heading }}</h2>
                    <div :class="noDivider ? '' : 'divide-y divide-zinc-200'">
                        <slot />
                    </div>
                </div>

                <div
                    v-if="$slots.footer"
                    :class="
                        shadowOnFooter
                            ? 'shrink-0 px-5 pb-5 pt-4 shadow-[0_-2px_6px_0_rgba(0,0,0,0.1)]'
                            : 'shrink-0 px-5 pb-5 pt-4'
                    "
                >
                    <slot name="footer"></slot>
                </div>
            </div>
        </div>
    </LTeleport>
</template>
