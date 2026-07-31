<script setup lang="ts">
import LButton from "../button/LButton.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import LModal from "@/components/modals/LModal.vue";
import { SunIcon, MoonIcon } from "@heroicons/vue/24/outline";
import { ComputerDesktopIcon } from "@heroicons/vue/24/solid";
import { theme } from "@/globalConfig";

const isVisible = defineModel<boolean>("isVisible", { required: true });
</script>

<template>
    <LModal heading="Select Theme" v-model:is-visible="isVisible">
        <div class="divide-y divide-zinc-200 dark:divide-slate-600 dark:text-zinc-100">
            <button
                class="flex h-10 w-full cursor-pointer items-center p-3 hover:bg-zinc-100 dark:hover:bg-slate-600"
                @click="theme = 'light'"
                data-test="switch-theme-button"
            >
                <SunIcon class="mr-2 h-4 w-4" aria-hidden="true" />
                <span class="text-sm">Light</span>
                <CheckCircleIcon
                    v-if="theme === 'light'"
                    class="ml-auto h-6 w-6 text-yellow-500"
                    aria-hidden="true"
                />
            </button>
            <button
                class="flex h-10 w-full cursor-pointer items-center p-3 hover:bg-zinc-100 dark:hover:bg-slate-600"
                @click="theme = 'dark'"
                data-test="switch-theme-button"
            >
                <MoonIcon class="mr-2 h-4 w-4" aria-hidden="true" />
                <span class="text-sm">Dark</span>
                <CheckCircleIcon
                    v-if="theme === 'dark'"
                    class="ml-auto h-6 w-6 text-yellow-500"
                    aria-hidden="true"
                />
            </button>
            <button
                class="flex h-10 w-full cursor-pointer items-center p-3 hover:bg-zinc-100 dark:hover:bg-slate-600"
                @click="theme = 'system'"
                data-test="switch-theme-button"
            >
                <ComputerDesktopIcon class="mr-2 h-4 w-4" aria-hidden="true" />
                <span class="text-sm">System</span>
                <CheckCircleIcon
                    v-if="theme === 'system'"
                    class="ml-auto h-6 w-6 text-yellow-500"
                    aria-hidden="true"
                />
            </button>
        </div>
        <template #footer>
            <LButton
                variant="primary"
                size="lg"
                rounding="less"
                class="w-full"
                @click="isVisible = false"
            >
                Close
            </LButton>
        </template>
    </LModal>
</template>
