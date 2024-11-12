<script setup lang="ts">
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/vue";
import LButton from "../button/LButton.vue";

type Props = {
    isVisible: boolean;
    heading: string;
    bLeft?: boolean;
    bLeftText?: string;
    bRight?: boolean;
    bRightText?: string;
};
defineProps<Props>();

const emit = defineEmits(["close", "b-left-click", "b-right-click"]);
</script>

<template>
    <Dialog :open="isVisible" @close="emit('close')">
        <div class="fixed inset-0 z-50 bg-slate-800 bg-opacity-50 backdrop-blur-sm"></div>
        <div class="fixed inset-0 z-50 flex items-center justify-center rounded-lg p-2">
            <DialogPanel
                class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-700"
            >
                <DialogTitle class="mb-4 text-lg font-semibold">{{ heading }}</DialogTitle>
                <div class="divide-y divide-zinc-200 dark:divide-slate-600">
                    <slot />
                </div>

                <div class="mt-4 flex w-full flex-row gap-1">
                    <div v-if="bRight || bLeft" class="flex w-3/4 gap-1">
                        <LButton
                            v-if="bLeft"
                            size="lg"
                            variant="primary"
                            rounding="less"
                            :class="bRight ? 'w-1/2' : 'w-full'"
                            @click="emit('b-left-click')"
                        >
                            {{ bLeftText }}</LButton
                        >
                        <LButton
                            v-if="bRight && bLeft"
                            size="lg"
                            variant="secondary"
                            rounding="less"
                            class="w-1/2"
                            @click="emit('b-right-click')"
                        >
                            {{ bRightText }}</LButton
                        >
                    </div>
                    <LButton
                        :variant="!bLeft ? 'primary' : 'tertiary'"
                        size="lg"
                        rounding="less"
                        :class="bLeft || bRight ? 'ml-auto w-1/4' : 'w-full'"
                        @click="emit('close')"
                    >
                        Close
                    </LButton>
                </div>
            </DialogPanel>
        </div>
    </Dialog>
</template>
