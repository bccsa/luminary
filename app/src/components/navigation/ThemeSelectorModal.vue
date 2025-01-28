<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import LButton from "../button/LButton.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import LModal from "../form/LModal.vue";
import { useI18n } from "vue-i18n";

type Props = {
    isVisible: boolean;
};
defineProps<Props>();

const { t } = useI18n();

// Use a key-based system for themes
const themeKeys = ["light", "dark", "system"]; // Non-translated keys
const themes = themeKeys.map((key) => ({
    key,
    label: t(`select_theme.${key}`), // Translated for display
}));

// Initialize with the value from localStorage (default to "system")
const selectedTheme = ref(localStorage.getItem("theme") || "system");

const emit = defineEmits(["close"]);

const applyTheme = (theme: string) => {
    if (theme === "system") {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    } else if (theme === "dark") {
        document.documentElement.classList.add("dark");
    } else {
        document.documentElement.classList.remove("dark");
    }
};

// Watch selectedTheme and update localStorage + theme
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
        :heading="t('select_theme.title')"
        :is-visible="isVisible"
        @close="emit('close')"
    >
        <div class="divide-y divide-zinc-200 dark:divide-slate-600">
            <button
                v-for="theme in themes"
                :key="theme.key"
                class="flex h-10 w-full cursor-pointer items-center p-3 hover:bg-zinc-100 dark:hover:bg-slate-600"
                @click="selectedTheme = theme.key"
                data-test="switch-theme-button"
            >
                <span class="text-sm">{{ theme.label }}</span>
                <CheckCircleIcon
                    v-if="selectedTheme === theme.key"
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
                {{ t("select_theme.close_button") }}
            </LButton>
        </template>
    </LModal>
</template>
