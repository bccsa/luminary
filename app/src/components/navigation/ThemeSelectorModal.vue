<script setup lang="ts">
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/vue";
import { ref, watch, onMounted } from "vue";
import LButton from "../button/LButton.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";

type Props = {
    isVisible: boolean;
};
defineProps<Props>();

const themes = ["Light", "Dark", "System"];
const selectedTheme = ref(localStorage.getItem("theme") || "System");

const emit = defineEmits(["close"]);

const applyTheme = (theme: string) => {
    if (theme === "System") {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    } else if (theme === "Dark") {
        document.documentElement.classList.add("dark");
    } else {
        document.documentElement.classList.remove("dark");
    }
};

watch(selectedTheme, (newTheme) => {
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
});

onMounted(() => {
    applyTheme(selectedTheme.value);
});
</script>

<template>
    <Dialog :open="isVisible" @close="emit('close')">
        <div class="fixed inset-0 bg-slate-800 bg-opacity-50 backdrop-blur-sm"></div>
        <div class="fixed inset-0 flex items-center justify-center rounded-lg p-4">
            <DialogPanel
                class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-700"
            >
                <DialogTitle class="mb-4 text-lg font-semibold">Select Theme</DialogTitle>
                <div class="divide-y divide-gray-200 dark:divide-zinc-700">
                    <button
                        v-for="theme in themes"
                        :key="theme"
                        class="flex w-full cursor-pointer items-center p-3 hover:bg-gray-100 dark:hover:bg-slate-500"
                        @click="selectedTheme = theme"
                        data-test="switch-language-button"
                    >
                        <span class="text-sm">{{ theme }}</span>
                        <CheckCircleIcon
                            v-if="selectedTheme === theme"
                            class="ml-auto h-6 w-6 text-yellow-500"
                            aria-hidden="true"
                        />
                    </button>
                </div>
                <LButton
                    variant="primary"
                    size="lg"
                    rounding="less"
                    class="mt-4 w-full"
                    @click="emit('close')"
                >
                    Close
                </LButton>
            </DialogPanel>
        </div>
    </Dialog>
</template>
