<script setup lang="ts">
import { db, DocType, type LanguageDto } from "luminary-shared";
import LButton from "../button/LButton.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import { appLanguageIdsAsRef } from "@/globalConfig";
import LModal from "../form/LModal.vue";
import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/vue/24/solid";
import { computed } from "vue";

type Props = {
    isVisible: boolean;
};
defineProps<Props>();

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

const emit = defineEmits(["close"]);

const defaultLanguage = computed(() => languages.value.find((lang) => lang.default == 1));

const setLanguage = (id: string) => {
    if (!appLanguageIdsAsRef.value.includes(id)) {
        appLanguageIdsAsRef.value.push(id);
    }
};

const indexLanguageUp = (id: string) => {
    const index = appLanguageIdsAsRef.value.indexOf(id);
    if (index > 0) {
        const temp = appLanguageIdsAsRef.value[index - 1];
        appLanguageIdsAsRef.value[index - 1] = appLanguageIdsAsRef.value[index];
        appLanguageIdsAsRef.value[index] = temp;
    }
};

const indexLanguageDown = (id: string) => {
    const index = appLanguageIdsAsRef.value.indexOf(id);
    if (index > 0) {
        // if (index === appLanguageIdsAsRef.value.length - 1) {
        //     appLanguageIdsAsRef.value.splice(index, 1);
        //     return;
        // }

        const temp = appLanguageIdsAsRef.value[index + 1];
        appLanguageIdsAsRef.value[index + 1] = appLanguageIdsAsRef.value[index];
        appLanguageIdsAsRef.value[index] = temp;
    }
};

const languagesSelected = computed(() => {
    const preferredOrder = appLanguageIdsAsRef.value;
    return preferredOrder
        .map((id) => languages.value.find((lang) => lang._id === id))
        .filter(Boolean) as LanguageDto[];
});

const availableLanguages = computed(() => {
    return languages.value.filter((lang) => !appLanguageIdsAsRef.value.includes(lang._id));
});
</script>

<template>
    <LModal
        name="lModal-languages"
        class="flex flex-col"
        heading="Select Language"
        :is-visible="isVisible"
        @close="emit('close')"
    >
        {{ defaultLanguage }}
        <h3 class="-mb-5">Your preffered Languages</h3>
        <div class="divide-y divide-zinc-200 py-4 dark:divide-slate-600">
            <button
                v-for="language in languagesSelected"
                :id="language._id"
                :key="language._id"
                class="flex w-full cursor-pointer items-center rounded-md p-3 disabled:bg-zinc-600 dark:hover:bg-slate-600"
                data-test="switch-language-button"
                :disabled="defaultLanguage?._id === language._id"
            >
                <div class="flex w-full justify-between">
                    <div class="flex w-full items-center gap-1">
                        <CheckCircleIcon
                            v-if="appLanguageIdsAsRef[0] === language._id"
                            class="h-6 w-6 text-yellow-500"
                        />
                        <span class="text-sm">{{ language.name }}</span>
                    </div>
                    <ArrowUpIcon
                        @click="indexLanguageUp(language._id)"
                        v-if="appLanguageIdsAsRef[0] !== language._id"
                        class="h-6 w-6 rounded-full px-1"
                    />
                    <ArrowDownIcon
                        v-if="appLanguageIdsAsRef[0] !== language._id"
                        class="h-6 w-6 rounded-full px-1"
                        @click="indexLanguageDown(language._id)"
                    />
                </div>
            </button>
            <h3 class="-mb-5" v-if="availableLanguages.length >= 1">Available Languages</h3>
            <div class="divide-y divide-zinc-200 py-4 dark:divide-slate-600">
                <button
                    v-for="language in availableLanguages"
                    :id="language._id"
                    :key="language._id"
                    class="flex w-full cursor-pointer items-center rounded-md p-3 hover:bg-zinc-200 dark:hover:bg-slate-600"
                    data-test="switch-language-button"
                    @click="setLanguage(language._id)"
                >
                    <div class="flex w-full justify-between">
                        <div class="flex w-full items-center gap-1">
                            <span class="text-sm">{{ language.name }}</span>
                        </div>
                    </div>
                </button>
            </div>
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
