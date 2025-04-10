<script setup lang="ts">
import { db, DocType, type LanguageDto } from "luminary-shared";
import LButton from "../button/LButton.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import { cmsLanguageIdAsRef } from "@/globalConfig";
import LModal from "./LModal.vue";

const isVisible = defineModel<boolean>("isVisible");
const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

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
        <div class="divide-y divide-zinc-200">
            <button
                v-for="language in languages"
                :key="language._id"
                class="flex w-full cursor-pointer items-center p-3 hover:bg-zinc-200"
                @click="setLanguage(language._id)"
                data-test="switch-language-button"
            >
                <span class="text-sm">{{ language.name }}</span>
                <CheckCircleIcon
                    v-if="cmsLanguageIdAsRef === language._id"
                    class="ml-auto h-6 w-6 text-zinc-900"
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
