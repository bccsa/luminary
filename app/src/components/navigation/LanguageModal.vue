<script setup lang="ts">
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/vue";
import { DocType, type LanguageDto } from "luminary-shared";
import { luminary } from "@/main";
import LButton from "../button/LButton.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import { appLanguageIdAsRef } from "@/globalConfig";

type Props = {
    isVisible: boolean;
};
defineProps<Props>();

const languages = luminary.db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

const emit = defineEmits(["close"]);

const setLanguage = (language: LanguageDto) => {
    appLanguageIdAsRef.value = language._id;
    emit("close");
};
</script>

<template>
    <Dialog :open="isVisible" @close="emit('close')">
        <div class="fixed inset-0 bg-gray-800 bg-opacity-50"></div>
        <div class="fixed inset-0 flex items-center justify-center p-2">
            <DialogPanel class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-800">
                <DialogTitle class="mb-4 text-lg font-semibold">Select Language</DialogTitle>
                <div class="divide-y divide-gray-200 dark:divide-zinc-700">
                    <button
                        v-for="language in languages"
                        :key="language._id"
                        class="flex w-full cursor-pointer items-center p-3 hover:bg-gray-100 dark:hover:bg-zinc-600"
                        @click="setLanguage(language)"
                        data-test="switch-language-button"
                    >
                        <span class="text-sm">{{ language.name }}</span>
                        <CheckCircleIcon
                            v-if="appLanguageIdAsRef === language._id"
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
