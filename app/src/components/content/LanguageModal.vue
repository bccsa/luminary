<script setup lang="ts">
import { db, DocType, type LanguageDto } from "luminary-shared";
import LButton from "../button/LButton.vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import { storeToRefs } from "pinia";

type Props = {
    isVisible: boolean;
};
defineProps<Props>();

const { appLanguage } = storeToRefs(useGlobalConfigStore());
const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

const emit = defineEmits(["close"]);
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
                    @click="
                        () => {
                            appLanguage = language;
                            emit('close');
                        }
                    "
                >
                    <span class="text-sm">{{ language.name }}</span>
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
