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
                class="relative z-50 max-h-screen w-full max-w-md rounded-lg bg-white/90 p-5 shadow-xl focus:outline-none"
            >
                <h2 class="mb-4 text-lg font-semibold px-1">{{ heading }}</h2>
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
