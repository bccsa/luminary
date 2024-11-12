<script setup lang="ts">
import LButton from "../button/LButton.vue";

type Props = {
    isVisible: boolean;
    heading: string;
    bLeftText?: string;
    bRightText?: string;
};
defineProps<Props>();

const emit = defineEmits(["close", "b-left-click", "b-right-click"]);
</script>

<template>
    <div :open="isVisible" @close="emit('close')">
        <div class="fixed inset-0 z-50 bg-slate-800 bg-opacity-50 backdrop-blur-sm"></div>
        <div class="fixed inset-0 z-50 flex items-center justify-center rounded-lg p-2">
            <div class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-700">
                <h2 class="mb-4 text-lg font-semibold">{{ heading }}</h2>
                <div class="divide-y divide-zinc-200 dark:divide-slate-600">
                    <slot />
                </div>

                <div class="mt-4 flex w-full flex-row gap-1">
                    <div v-if="bRightText || bLeftText" class="flex w-3/4 gap-1">
                        <LButton
                            name="left-button"
                            v-if="bLeftText"
                            size="lg"
                            variant="primary"
                            rounding="less"
                            :class="bRightText ? 'w-1/2' : 'w-full'"
                            @click="emit('b-left-click')"
                        >
                            {{ bLeftText }}</LButton
                        >
                        <LButton
                            name="right-button"
                            v-if="bRightText && bLeftText"
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
                        name="close-button"
                        :variant="!bLeftText ? 'primary' : 'tertiary'"
                        size="lg"
                        rounding="less"
                        :class="bLeftText || bRightText ? 'ml-auto w-1/4' : 'w-full'"
                        @click="emit('close')"
                    >
                        Close
                    </LButton>
                </div>
            </div>
        </div>
    </div>
</template>
