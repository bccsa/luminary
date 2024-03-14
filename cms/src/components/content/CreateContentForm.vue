<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import LBadge from "@/components/common/LBadge.vue";
import LInput from "@/components/forms/LInput.vue";
import FormLabel from "@/components/forms/FormLabel.vue";
import { useLanguageStore } from "@/stores/language";
import type { CreateContentParentDto, Language, TagType } from "@/types";
import { ref } from "vue";
import { ArrowRightIcon } from "@heroicons/vue/20/solid";
import { useForm } from "vee-validate";
import * as yup from "yup";
import { toTypedSchema } from "@vee-validate/yup";

type Props = {
    entityName: string;
};

defineProps<Props>();

const languageStore = useLanguageStore();

const emit = defineEmits(["save"]);

const validationSchema = toTypedSchema(
    yup.object({
        image: yup.string().required(),
        title: yup.string().required(),
    }),
);

const { handleSubmit } = useForm({
    validationSchema,
});

const chosenLanguage = ref<Language>();

function chooseLanguage(language: Language) {
    chosenLanguage.value = language;
}
function resetLanguage() {
    chosenLanguage.value = undefined;
}

const save = handleSubmit(async (values) => {
    const dto: CreateContentParentDto = {
        image: values.image,
        language: chosenLanguage.value!,
        title: values.title,
    };

    emit("save", dto);
});
</script>

<template>
    <form class="space-y-6" @submit.prevent="save">
        <p class="text-sm text-gray-700">
            These are all the required fields for creating a new {{ entityName }}. After clicking
            'continue' the {{ entityName }} will be saved as a draft and you can continue editing.
        </p>

        <LInput
            name="image"
            label="Default image"
            placeholder="cdn.bcc.africa/img/image.png"
            leftAddOn="https://"
        />

        <LInput name="permissions" label="Permissions" placeholder="Not implemented yet" disabled />

        <transition
            enter-active-class="transition ease-out duration-150"
            enter-from-class="transform opacity-0 -translate-y-2"
            enter-to-class="transform opacity-100 translate-y-0"
            leave-active-class="hidden"
        >
            <div class="space-y-2" v-if="!chosenLanguage">
                <FormLabel>Select language for first translation</FormLabel>
                <div class="rounded-lg border-2 border-gray-100">
                    <button
                        type="button"
                        v-for="language in languageStore.languages"
                        :key="language.languageCode"
                        class="group flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm text-gray-950 hover:bg-gray-50 active:bg-gray-100"
                        @click="chooseLanguage(language)"
                        data-test="language"
                    >
                        <div class="flex items-center gap-2">
                            <LBadge type="language" no-icon>
                                {{ language.languageCode }}
                            </LBadge>
                            {{ language.name }}
                        </div>
                        <div
                            class="hidden text-xs text-gray-600 sm:group-hover:block sm:group-active:block"
                        >
                            Select
                        </div>
                    </button>
                </div>
            </div>
        </transition>

        <transition
            enter-active-class="transition ease-out duration-150"
            enter-from-class="transform opacity-0 translate-y-2"
            enter-to-class="transform opacity-100 translate-y-0"
            leave-active-class="hidden"
        >
            <div v-if="chosenLanguage" class="space-y-6">
                <LInput name="title" label="Title" :placeholder="chosenLanguage.name" />

                <div class="flex flex-col gap-4 sm:flex-row sm:justify-between">
                    <button
                        type="button"
                        class="text-xs text-gray-600 hover:text-gray-800"
                        @click="resetLanguage"
                        data-test="reset"
                    >
                        Select different language
                    </button>
                    <LButton type="submit" variant="primary" :icon="ArrowRightIcon" icon-right>
                        Save as draft & continue
                    </LButton>
                </div>
            </div>
        </transition>
    </form>
</template>
