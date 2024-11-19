<script setup lang="ts">
import { db, DocType, type LanguageDto } from "luminary-shared";
import LButton from "../button/LButton.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import { appLanguageIdAsRef } from "@/globalConfig";
import LModal from "../form/LModal.vue";

type Props = {
    isVisible: boolean;
};
defineProps<Props>();

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

const emit = defineEmits(["close"]);

const setLanguage = (id: string) => {
    appLanguageIdAsRef.value = id;
    emit("close");
};
</script>

<template>
    <LModal name="lModal-languages" heading="Select Language" :is-visible="isVisible">
        <div class="divide-y divide-zinc-200 dark:divide-slate-600">
            <button
                v-for="language in languages"
                :key="language._id"
                class="flex w-full cursor-pointer items-center p-3 hover:bg-zinc-100 dark:hover:bg-slate-600"
                @click="setLanguage(language._id)"
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
