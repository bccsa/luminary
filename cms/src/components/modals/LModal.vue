<script setup lang="ts">
import { ref, watch } from "vue";
import LTeleport from "../common/LTeleport.vue";
import { XMarkIcon } from "@heroicons/vue/24/solid";
import { breakpointsTailwind, useBreakpoints } from "@vueuse/core";
import LButton from "../button/LButton.vue";

type Props = {
    heading: string;
    noDivider?: boolean;
    largeModal?: boolean;
    stickToEdges?: boolean;
    showClosingButton?: boolean;
    // When true, the modal cannot be dismissed by clicking outside of it or pressing Escape.
    preventClose?: boolean;
    beforeClose?: () => boolean;
};
const props = withDefaults(defineProps<Props>(), {
    largeModal: false,
    noDivider: false,
    showClosingButton: true,
    preventClose: false,
});

const isVisible = defineModel<boolean>("isVisible");

const tryClose = () => {
    if (props.beforeClose && props.beforeClose() === false) return;
    isVisible.value = false;
};

// Dismiss attempts via the backdrop or the Escape key; blocked when preventClose is set.
const tryDismiss = () => {
    if (props.preventClose) return;
    tryClose();
};

const modalRef = ref<HTMLElement>();

watch(modalRef, (el) => {
    if (el) {
        el.focus({ preventScroll: true });
    }
});

const breakpoints = useBreakpoints(breakpointsTailwind);
const isLargeScreen = breakpoints.smaller("sm");
</script>

<template>
    <LTeleport v-if="isVisible">
        <div
            :class="[
                'fixed inset-x-0 top-0 z-50 flex h-[100dvh] items-center justify-center bg-zinc-800 bg-opacity-50 backdrop-blur-sm',
                stickToEdges && isLargeScreen ? '' : 'p-2',
            ]"
            @mousedown.self="tryDismiss()"
            data-test="modal-backdrop"
        >
            <!-- Modal content at higher z-index -->
            <div
                tabindex="0"
                @keydown.esc="tryDismiss()"
                @click.stop
                ref="modalRef"
                data-test="modal-content"
                :class="[
                    'relative z-50 flex max-h-[100dvh] flex-col rounded-lg bg-white/90 p-5 shadow-xl focus:outline-none',
                    isLargeScreen && stickToEdges
                        ? 'w-[100vw] max-w-none rounded-none'
                        : largeModal
                          ? 'w-fit min-w-[448px] max-w-[100%]'
                          : 'w-full max-w-md',
                ]"
            >
                <div class="mb-2 flex w-full items-center justify-between">
                    <div class="flex items-center">
                        <h2 v-if="heading" class="text-lg font-semibold">
                            {{ heading }}
                        </h2>
                        <div v-if="$slots.headingExtension">
                            <slot name="headingExtension" />
                        </div>
                    </div>
                    <div class="flex">
                        <div v-if="$slots.rightHeading">
                            <slot name="rightHeading" />
                        </div>
                        <div v-if="showClosingButton" class="ml-2">
                            <LButton
                                @click="tryClose()"
                                :icon="XMarkIcon"
                                variant="secondary"
                                mainDynamicCss="px-0.5 py-0.5 rounded-xl"
                                iconClass="h-5 w-5"
                            >
                            </LButton>
                        </div>
                    </div>
                </div>
                <div
                    :class="[
                        noDivider ? '' : 'divide-y divide-zinc-200',
                        'flex min-h-0 flex-1 flex-col',
                    ]"
                >
                    <slot />
                </div>

                <div v-if="$slots.footer" class="shrink-0 pt-3">
                    <slot name="footer" />
                </div>
            </div>
        </div>
    </LTeleport>
</template>
