<script setup lang="ts">
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
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-full opacity-0"
    >
        <div
            v-if="visible"
            class="fixed bottom-[76px] right-0 z-40 w-full max-w-sm px-4 lg:bottom-5 lg:right-5 lg:px-0"
            role="dialog"
            :aria-label="t('content.continueReading.prompt')"
        >
            <div
                class="flex flex-col gap-3 rounded-lg bg-white p-4 shadow-lg ring-1 ring-zinc-200 dark:bg-slate-800 dark:ring-slate-600"
            >
                <p class="text-sm font-medium text-zinc-900 dark:text-slate-100">
                    {{ t("content.continueReading.prompt") }}
                </p>
                <p class="text-xs text-zinc-600 dark:text-slate-400">
                    {{ progressPercent }}%
                </p>
                <div class="flex gap-2">
                    <button
                        type="button"
                        class="flex-1 rounded-md bg-yellow-500 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-yellow-400"
                        @click="emit('continue')"
                    >
                        {{ t("content.continueReading.action") }}
                    </button>
                    <button
                        type="button"
                        class="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-700"
                        @click="emit('dismiss')"
                    >
                        {{ t("content.continueReading.dismiss") }}
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>
