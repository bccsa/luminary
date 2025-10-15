<script setup lang="ts">
import LButton from "../button/LButton.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import LModal from "../form/LModal.vue";
import { SunIcon, MoonIcon } from "@heroicons/vue/24/outline";
import { ComputerDesktopIcon } from "@heroicons/vue/24/solid";
import { useI18n } from "vue-i18n";
import { theme } from "@/globalConfigOld";

type Props = {
    isVisible: boolean;
};
defineProps<Props>();

const { t } = useI18n();

const emit = defineEmits(["close"]);
</script>

<template>
    <LModal name="lModal-languages" :heading="t('select_theme.title')" :is-visible="isVisible" @close="emit('close')">
        <div class="divide-y divide-zinc-200 dark:divide-slate-600">
            <button class="flex h-10 w-full cursor-pointer items-center p-3 hover:bg-zinc-100 dark:hover:bg-slate-600"
                @click="theme = 'light'" data-test="switch-theme-button">
                <SunIcon class="mr-2 h-4 w-4" aria-hidden="true" />
                <span class="text-sm">{{ t("select_theme.light") }}</span>
                <CheckCircleIcon v-if="theme === 'light'" class="ml-auto h-6 w-6 text-yellow-500" aria-hidden="true" />
            </button>
            <button class="flex h-10 w-full cursor-pointer items-center p-3 hover:bg-zinc-100 dark:hover:bg-slate-600"
                @click="theme = 'dark'" data-test="switch-theme-button">
                <MoonIcon class="mr-2 h-4 w-4" aria-hidden="true" />
                <span class="text-sm">{{ t("select_theme.dark") }}</span>
                <CheckCircleIcon v-if="theme === 'dark'" class="ml-auto h-6 w-6 text-yellow-500" aria-hidden="true" />
            </button>
            <button class="flex h-10 w-full cursor-pointer items-center p-3 hover:bg-zinc-100 dark:hover:bg-slate-600"
                @click="theme = 'system'" data-test="switch-theme-button">
                <ComputerDesktopIcon class="mr-2 h-4 w-4" aria-hidden="true" />
                <span class="text-sm">{{ t("select_theme.system") }}</span>
                <CheckCircleIcon v-if="theme === 'system'" class="ml-auto h-6 w-6 text-yellow-500" aria-hidden="true" />
            </button>
        </div>
        <template #footer>
            <LButton variant="primary" size="lg" rounding="less" class="w-full" @click="emit('close')">
                {{ t("select_theme.close_button") }}
            </LButton>
        </template>
    </LModal>
</template>
