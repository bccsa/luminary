<script setup lang="ts">
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
    <div
        v-if="isVisible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-gray-800 bg-opacity-75"
    >
        <div class="w-11/12 rounded-lg bg-white p-6 shadow-lg sm:w-96 dark:bg-zinc-900">
            <h2 class="mb-4 text-lg font-semibold">Select Theme</h2>
            <ul class="divide-y divide-gray-200 dark:divide-zinc-700">
                <li
                    v-for="theme in themes"
                    :key="theme"
                    class="flex cursor-pointer items-center p-3 hover:bg-gray-100 dark:hover:bg-zinc-600"
                    @click="selectedTheme = theme"
                >
                    <span class="text-sm">{{ theme }}</span>
                    <CheckCircleIcon
                        v-if="selectedTheme === theme"
                        class="ml-auto h-6 w-6 text-yellow-500"
                        aria-hidden="true"
                    />
                </li>
            </ul>

            <LButton
                variant="primary"
                size="lg"
                :to="{ name: 'login' }"
                rounding="less"
                class="mt-4 w-full"
                @click="emit('close')"
            >
                Close
            </LButton>
        </div>
    </div>
</template>
