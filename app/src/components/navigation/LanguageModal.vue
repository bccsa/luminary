<script setup lang="ts">
import { db, DocType, type LanguageDto, useDexieLiveQuery } from "luminary-shared";
import LButton from "../button/LButton.vue";
import { appLanguageIdsAsRef } from "@/globalConfig";
import LModal from "../form/LModal.vue";
import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/vue/24/solid";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import { PlusCircleIcon } from "@heroicons/vue/24/outline";
import { handleLanguageChange, markLanguageSwitch } from "@/util/isLangSwitch";

import { computed } from "vue";
import { useI18n } from "vue-i18n";

type Props = {
    isVisible: boolean;
};
defineProps<Props>();

const { t } = useI18n();

const languages = useDexieLiveQuery(
    () => db.docs.where({ type: DocType.Language }).toArray() as unknown as Promise<LanguageDto[]>,
    { initialValue: [] },
);

const emit = defineEmits(["close"]);

const defaultLanguage = computed(() => languages.value.find((lang) => lang.default == 1));

const languagesSelected = computed(() => {
    const preferredOrder = appLanguageIdsAsRef.value;
    return preferredOrder
        .map((id) => languages.value.find((lang) => lang._id === id))
        .filter(Boolean) as LanguageDto[];
});

const availableLanguages = computed(() => {
    return languages.value
        .filter((lang) => !appLanguageIdsAsRef.value.includes(lang._id))
        .sort((a, b) => {
            if (a.name < b.name) {
                return -1;
            }
            if (a.name > b.name) {
                return 1;
            }
            return 0;
        });
});

const removeFromSelected = (id: string) => {
    if (defaultLanguage.value?._id === id) {
        return;
    }

    appLanguageIdsAsRef.value.splice(appLanguageIdsAsRef.value.indexOf(id), 1);
    markLanguageSwitch();
};
</script>

<template>
    <LModal
        name="lModal-languages"
        class="flex flex-col"
        :heading="t('language.modal.title')"
        :is-visible="isVisible"
        @close="emit('close')"
    >
        <transition-group
            name="language"
            tag="div"
            class="divide-y divide-zinc-200 dark:divide-slate-600"
            enter-active-class="transition duration-100 ease-in-out"
            enter-from-class="opacity-0 transform -translate-y-2"
            enter-to-class="opacity-100 transform translate-y-0"
            leave-active-class="transition duration-100 ease-in-out"
            leave-from-class="opacity-100 transform translate-y-0"
            leave-to-class="opacity-0 transform translate-y-2"
            move-class="transition duration-100 ease-in-out"
        >
            <div
                v-for="language in languagesSelected"
                :id="language._id"
                :key="language._id"
                class="flex w-full items-center p-3"
            >
                <div class="flex w-full justify-between">
                    <div
                        class="flex w-full cursor-pointer items-center gap-1"
                        @click="removeFromSelected(language._id)"
                    >
                        <CheckCircleIcon
                            v-if="appLanguageIdsAsRef.includes(language._id)"
                            class="h-5 w-5 cursor-pointer text-yellow-500 hover:text-yellow-400"
                            :class="
                                defaultLanguage?._id === language._id
                                    ? 'cursor-auto text-zinc-400 hover:text-zinc-400 dark:text-slate-400 hover:dark:text-slate-400'
                                    : ''
                            "
                        />
                        <div class="flex w-full justify-between">
                            <div class="flex w-full items-center">
                                <span class="text-sm">{{ language.name }}</span>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <ArrowUpIcon
                            v-if="language._id !== appLanguageIdsAsRef[0]"
                            @click="
                                handleLanguageChange({
                                    languageId: language._id,
                                    options: { increasePriority: true },
                                })
                            "
                            class="curser-pointer h-6 w-6 rounded-full px-1 hover:text-yellow-600 dark:hover:text-yellow-500"
                        />
                        <ArrowDownIcon
                            v-if="
                                language._id !== appLanguageIdsAsRef[appLanguageIdsAsRef.length - 1]
                            "
                            class="curser-pointer h-6 w-6 rounded-full px-1 hover:text-yellow-600 dark:hover:text-yellow-500"
                            @click="
                                handleLanguageChange({
                                    languageId: language._id,
                                    options: { decreasePriority: true },
                                })
                            "
                        />
                    </div>
                </div>
            </div>
        </transition-group>
        <div class="divide-y divide-zinc-200 dark:divide-slate-600">
            <div
                v-for="language in availableLanguages"
                :id="language._id"
                :key="language._id"
                class="flex w-full cursor-pointer items-center gap-1 p-3"
                data-test="add-language-button"
                @click="
                    handleLanguageChange({
                        languageId: language._id,
                        options: { add: true },
                    })
                "
            >
                <PlusCircleIcon
                    class="h-5 w-5 cursor-pointer text-zinc-500 hover:text-yellow-600 dark:text-slate-400 dark:hover:text-yellow-500"
                ></PlusCircleIcon>

                <div class="flex w-full justify-between">
                    <div class="flex w-full items-center gap-1">
                        <span class="text-sm">{{ language.name }}</span>
                    </div>
                </div>
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
                {{ t("language.modal.close") }}
            </LButton>
        </template>
    </LModal>
</template>
