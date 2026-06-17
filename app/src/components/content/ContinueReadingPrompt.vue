<script setup lang="ts">
import { XMarkIcon } from "@heroicons/vue/20/solid";
import { useI18n } from "vue-i18n";

defineProps<{
    visible: boolean;
    progressPercent: number;
}>();

const emit = defineEmits<{
    continue: [];
    dismiss: [];
}>();

const { t } = useI18n();
</script>

<template>
    <Transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="translate-y-full opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-full opacity-0"
    >
        <div
            v-if="visible"
            class="fixed z-40 w-max min-w-[12rem] max-w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 px-4 max-lg:left-1/2 max-lg:bottom-[calc(var(--mobile-menu-h,78px)+0.75rem)] lg:bottom-5 lg:left-[calc(50%+var(--desktop-sidebar-w,16rem)/2)]"
            role="dialog"
            :aria-label="t('content.continueReading.prompt')"
        >
            <div
                class="overflow-hidden rounded-lg bg-zinc-100 shadow-lg ring-1 ring-zinc-900/10 dark:bg-slate-700 dark:ring-slate-600"
            >
                <div
                    class="h-1 bg-zinc-200 dark:bg-slate-600"
                    role="progressbar"
                    :aria-valuenow="progressPercent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                >
                    <div
                        class="h-full bg-yellow-500 transition-[width] duration-300"
                        :style="{ width: `${progressPercent}%` }"
                    />
                </div>
                <div class="flex items-center gap-1 p-1.5">
                    <button
                        type="button"
                        class="min-w-0 flex-1 rounded-md px-3 py-2 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-600"
                        @click="emit('continue')"
                    >
                        {{ t("content.continueReading.action") }}
                    </button>
                    <button
                        type="button"
                        class="flex-shrink-0 rounded-md p-2 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-slate-100"
                        :aria-label="t('content.continueReading.dismiss')"
                        @click="emit('dismiss')"
                    >
                        <XMarkIcon class="h-5 w-5" />
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>
