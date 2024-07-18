<script setup lang="ts">
import { db, DocType, type LanguageDto } from "luminary-shared";
import LButton from "../button/LButton.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import { appLanguageIdAsRef } from "@/globalConfig";
import { computed } from "vue";

type Props = {
    isVisible: boolean;
};
defineProps<Props>();

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);
const appLanguage = computed(() => {
    if (!appLanguageIdAsRef.value || !languages.value.length) return;

    const preferred = languages.value.find((language) => language._id === appLanguageIdAsRef.value);

    if (preferred) return preferred;

    return languages.value[0];
});

const emit = defineEmits(["close"]);

const setLanguage = (language: LanguageDto) => {
    appLanguageIdAsRef.value = language._id;
    emit("close");
};
</script>

<template>
    <div
        v-if="isVisible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-gray-800 bg-opacity-75"
    >
        <div class="w-11/12 rounded-lg bg-white p-6 shadow-lg sm:w-96 dark:bg-zinc-900">
            <h2 class="mb-4 text-lg font-semibold">Select Language</h2>
            <ul class="divide-y divide-gray-200">
                <li
                    v-for="language in languages"
                    :key="language._id"
                    class="flex cursor-pointer items-center p-3 hover:bg-gray-100 dark:hover:bg-zinc-600"
                    @click="setLanguage(language)"
                >
                    <span class="text-sm">{{ language.name }}</span>
                    <CheckCircleIcon
                        v-if="appLanguage?._id === language._id"
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
