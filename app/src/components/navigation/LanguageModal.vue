<script setup lang="ts">
import { db, DocType, type LanguageDto } from "luminary-shared";
import LButton from "../button/LButton.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import { appLanguageIdsAsRef } from "@/globalConfig";
import LModal from "../form/LModal.vue";
import { Bars2Icon, HandRaisedIcon } from "@heroicons/vue/24/solid";

type Props = {
    isVisible: boolean;
};
defineProps<Props>();

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

const emit = defineEmits(["close"]);

const setLanguage = (id: string) => {
    appLanguageIdsAsRef.value.push(id);
};

const handleLanguageDrag = (event: DragEvent) => {
    const target = event.currentTarget as HTMLElement;
    event.dataTransfer?.setData("language", target.id);
};

const handleLanguageDrop = (event: DragEvent) => {
    event.preventDefault();
    const languageId = event.dataTransfer?.getData("language");

    const target = event.currentTarget as HTMLElement;
    target.appendChild(document.getElementById(languageId!)!);

    appLanguageIdsAsRef.value = Array.from(target.children).map((child) => child.id);
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
        <div
            class="divide-y divide-zinc-200 py-4 dark:divide-slate-600"
            :ondragover="(event: DragEvent) => event.preventDefault()"
            :ondrop="handleLanguageDrop"
            dropzone="move"
        >
            <button
                v-for="language in languages"
                :id="language._id"
                :key="language._id"
                class="flex w-full cursor-pointer items-center p-3 hover:bg-zinc-100 dark:hover:bg-slate-600"
                @click="setLanguage(language._id)"
                data-test="switch-language-button"
                draggable="true"
                :ondragstart="handleLanguageDrag"
            >
                <div class="flex w-full">
                    <div class="flex items-center gap-1">
                        <CheckCircleIcon
                            v-if="appLanguageIdsAsRef[0] === language._id"
                            class="h-6 w-6 text-yellow-500"
                        />
                        <span class="text-sm">{{ language.name }}</span>
                    </div>
                </div>
                <HandRaisedIcon class="h-6 w-6" />
                <Bars2Icon class="h-6 w-6" />
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
