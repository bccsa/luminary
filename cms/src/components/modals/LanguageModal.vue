<script setup lang="ts">
import { DocType, type LanguageDto, useSharedHybridQuery } from "luminary-shared";
import LButton from "../button/LButton.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import { cmsLanguageIdAsRef } from "@/globalConfig";
import LModal from "./LModal.vue";

const isVisible = defineModel<boolean>("isVisible");
const languages = useSharedHybridQuery<LanguageDto>(
    () => ({ selector: { type: DocType.Language } }),
    { live: true },
);

const setLanguage = (id: string) => {
    cmsLanguageIdAsRef.value = id;
    isVisible.value = false;
};
</script>

<template>
    <LModal
        name="lModal-languages"
        heading="Select preferred content language"
        v-model:is-visible="isVisible"
    >
        <div class="divide-y divide-zinc-200 dark:divide-slate-600 dark:text-zinc-100">
            <button
                v-for="language in languages"
                :key="language._id"
                class="flex h-10 w-full cursor-pointer items-center p-3 hover:bg-zinc-100 dark:hover:bg-slate-600"
                @click="setLanguage(language._id)"
                data-test="switch-language-button"
            >
                <span class="text-sm">{{ language.name }}</span>
                <CheckCircleIcon
                    v-if="cmsLanguageIdAsRef === language._id"
                    class="ml-auto h-6 w-6 text-yellow-500"
                    aria-hidden="true"
                />
            </button>
        </div>
        <template #footer>
            <LButton
                variant="secondary"
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
