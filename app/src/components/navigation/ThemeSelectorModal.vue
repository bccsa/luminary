<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import LButton from "../button/LButton.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import LModal from "../form/LModal.vue";
import { SunIcon, MoonIcon, AdjustmentsHorizontalIcon } from "@heroicons/vue/24/outline";
import { ComputerDesktopIcon } from "@heroicons/vue/24/solid";

type Props = {
    isVisible: boolean;
    icons?: boolean;
};
defineProps<Props>();

const themes = ["Light", "Dark", "System"];
const themeIcons = [SunIcon, MoonIcon, ComputerDesktopIcon];

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
    <LModal
        name="lModal-languages"
        heading="Select Theme"
        :is-visible="isVisible"
        @close="emit('close')"
    >
        <div class="divide-y divide-zinc-200 dark:divide-slate-600">
            <button
                v-for="theme in themes"
                :key="theme"
                class="flex h-10 w-full cursor-pointer items-center p-3 hover:bg-zinc-100 dark:hover:bg-slate-600"
                @click="selectedTheme = theme"
                data-test="switch-theme-button"
            >
                <component
                    v-if="themeIcons"
                    :is="themeIcons[themes.indexOf(theme)]"
                    class="mr-2 h-4 w-4"
                    aria-hidden="true"
                />
                <span class="text-sm">{{ theme }}</span>
                <CheckCircleIcon
                    v-if="selectedTheme === theme"
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
                @click="emit('close')"
            >
                Close
            </LButton>
        </template>
    </LModal>
</template>
