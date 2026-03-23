<script setup lang="ts">
import { ref, watch } from "vue";
import LTeleport from "../common/LTeleport.vue";
import { XMarkIcon } from "@heroicons/vue/24/outline";
import { breakpointsTailwind, useBreakpoints } from "@vueuse/core";

type Props = {
    heading: string;
    noDivider?: boolean;
    largeModal?: boolean;
    stickToEdges?: boolean;
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

const breakpoints = useBreakpoints(breakpointsTailwind);
const isMobileScreen = breakpoints.smaller("sm");
</script>

<template>
    <LTeleport v-if="isVisible">
        <div
            :class="[
                'fixed inset-0 z-50 flex items-center justify-center bg-zinc-800 bg-opacity-50 backdrop-blur-sm',
                stickToEdges && isMobileScreen ? '' : 'p-2',
            ]"
            @click="isVisible = false"
        >
            <!-- Modal content at higher z-index -->
            <div
                tabindex="0"
                @keydown.esc="isVisible = false"
                @click.stop
                ref="modalRef"
                :class="[
                    'relative z-50 flex max-h-screen flex-col rounded-lg bg-white/90 p-5 shadow-xl focus:outline-none',
                    isMobileScreen && stickToEdges
                        ? 'w-[100vw] max-w-none rounded-none'
                        : largeModal
                          ? 'w-fit min-w-[448px] max-w-[100%]'
                          : 'w-full max-w-md',
                ]"
            >
                <div class="flex w-full items-center justify-between">
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
                        <div class="ml-6">
                            <button @click="isVisible = false">
                                <XMarkIcon class="h-6 w-6" />
                            </button>
                        </div>
                    </div>
                </div>
                <div
                    :class="[
                        noDivider ? '' : 'divide-y divide-zinc-200',
                        'mt-4 flex min-h-0 flex-1 flex-col',
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
