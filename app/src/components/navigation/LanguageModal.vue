<script setup lang="ts">
import { db, DocType, type LanguageDto } from "luminary-shared";
import LButton from "../button/LButton.vue";
import { appLanguageIdsAsRef } from "@/globalConfig";
import LModal from "../form/LModal.vue";
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "@heroicons/vue/24/solid";
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
    if (defaultLanguage.value?._id === id) {
        return;
    }

    const index = appLanguageIdsAsRef.value.indexOf(id);
    if (index >= 0) {
        const temp = appLanguageIdsAsRef.value[index - 1];
        appLanguageIdsAsRef.value[index - 1] = appLanguageIdsAsRef.value[index];
        appLanguageIdsAsRef.value[index] = temp;
    }
};

const indexLanguageDown = (id: string) => {
    if (defaultLanguage.value?._id === id) {
        return;
    }

    const index = appLanguageIdsAsRef.value.indexOf(id);
    if (index >= 0) {
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

const removeFromSelected = (id: string) => {
    if (defaultLanguage.value?._id === id) {
        return;
    }

    const index = appLanguageIdsAsRef.value.indexOf(id);
    appLanguageIdsAsRef.value.splice(index, 1);
};
</script>

<template>
    <LModal
        name="lModal-languages"
        class="flex flex-col"
        heading="Select Language"
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
            <button
                v-for="language in languagesSelected"
                :id="language._id"
                :key="language._id"
                class="flex w-full cursor-pointer items-center rounded-md p-3 dark:hover:bg-slate-600"
                data-test="switch-language-button"
                :disabled="defaultLanguage?._id === language._id"
            >
                <div class="flex w-full justify-between">
                    <div class="flex w-full items-center gap-1">
                        <TrashIcon
                            @click="removeFromSelected(language._id)"
                            v-if="appLanguageIdsAsRef.includes(language._id)"
                            class="h-5 w-5 text-yellow-500"
                            :class="defaultLanguage?._id === language._id ? 'text-zinc-400' : ''"
                        />
                        <div
                            class="flex w-full justify-between"
                            :class="defaultLanguage?._id === language._id ? 'text-zinc-400' : ''"
                        >
                            <div class="flex w-full items-center gap-1">
                                <span class="text-sm">{{ language.name }}</span>
                            </div>
                        </div>
                    </div>

                    <ArrowUpIcon
                        v-if="language._id !== appLanguageIdsAsRef[0]"
                        @click="indexLanguageUp(language._id)"
                        class="h-6 w-6 rounded-full px-1"
                        :class="defaultLanguage?._id === language._id ? 'text-zinc-400' : ''"
                    />
                    <ArrowDownIcon
                        v-if="language._id !== appLanguageIdsAsRef[appLanguageIdsAsRef.length - 1]"
                        class="h-6 w-6 rounded-full px-1"
                        @click="indexLanguageDown(language._id)"
                        :class="defaultLanguage?._id === language._id ? 'text-zinc-400' : ''"
                    />
                </div>
            </button>
        </transition-group>
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
