<script setup lang="ts">
import EditContentValidation from "./EditContentValidation.vue";
import {
    type ContentDto,
    type Uuid,
    type LanguageDto,
    type ContentParentDto,
} from "luminary-shared";
import { ref, watch, watchEffect } from "vue";
import { validate, type Validation } from "./ContentValidator";
import LanguageSelector from "./LanguageSelector.vue";
import { ExclamationCircleIcon, XCircleIcon } from "@heroicons/vue/20/solid";

type Props = {
    languages: LanguageDto[];
    dirty: boolean;
    parentPrev: ContentParentDto | undefined;
    contentPrev: ContentDto[] | undefined;
    canEdit: boolean;
    canTranslate: boolean;
    canPublish: boolean;
    untranslatedLanguages: LanguageDto[];
};
defineProps<Props>();
const parent = defineModel<ContentParentDto>("parent");
const contentDocs = defineModel<ContentDto[]>("contentDocs");

// Overall validation checking
const overallValidations = ref([] as Validation[]);
const overallIsValid = ref(true);

const setOverallValidation = (id: Uuid, isValid: boolean) => {
    let validation = overallValidations.value.find((v) => v.id == id);
    if (!validation) {
        validation = { id, isValid, message: "" };
        overallValidations.value.push(validation);
    } else {
        validation.isValid = isValid;
    }
    overallIsValid.value = overallValidations.value.every((v) => v.isValid);
};

const emit = defineEmits<{
    (e: "updateIsValid", value: boolean): void;
    (e: "createTranslation", language: LanguageDto): void;
}>();

watchEffect(() => {
    emit("updateIsValid", overallIsValid.value);
});

// Parent validation
const parentValidations = ref([] as Validation[]);
const parentIsValid = ref(true);
watch(
    [parent, contentDocs],
    ([newParent, newContentDocs]) => {
        if (!newParent) return;

        validate(
            "At least one group membership is required",
            "groups",
            parentValidations.value,
            newParent,
            () => newParent.memberOf.length > 0,
        );

        validate(
            "At least one translation is required",
            "translations",
            parentValidations.value,
            newParent,
            () => newContentDocs != undefined && newContentDocs.length > 0,
        );

        parentIsValid.value = parentValidations.value.every((v) => v.isValid);

        // Update overall validation
        let parentOverallValidation = overallValidations.value.find((v) => v.id == newParent._id);
        if (!parentOverallValidation) {
            parentOverallValidation = {
                id: newParent._id,
                isValid: parentIsValid.value,
                message: "",
            };
            overallValidations.value.push(parentOverallValidation);
        } else {
            parentOverallValidation.isValid = parentIsValid.value;
        }
        overallIsValid.value = overallValidations.value.every((v) => v.isValid);
    },
    { immediate: true, deep: true },
);
</script>

<template>
    <div class="rounded-md bg-zinc-100 p-3 shadow-inner">
        <div class="flex flex-col gap-2">
            <div
                v-if="!(canTranslate || canPublish) || !canEdit"
                class="mb-1 rounded-md bg-zinc-50 p-4 shadow"
            >
                <span v-if="!canTranslate" class="mb-1 flex gap-1 text-xs text-zinc-600">
                    <ExclamationCircleIcon class="h-4 min-h-4 w-4 min-w-4 text-red-400" />No
                    translate permission</span
                >
                <span v-if="!canPublish" class="mb-1 flex gap-1 text-xs text-zinc-600">
                    <ExclamationCircleIcon class="h-4 w-4 text-red-400" />No publish
                    permission</span
                >
                <span v-if="!canEdit" class="flex gap-1 text-xs text-zinc-600">
                    <ExclamationCircleIcon class="h-4 min-h-4 w-4 min-w-4 text-red-400" />No edit
                    permission</span
                >
            </div>
            <div v-if="!parentIsValid">
                <div class="mb-1 mt-1 flex flex-col gap-0.5">
                    <div
                        v-for="validation in parentValidations.filter((v) => !v.isValid)"
                        :key="validation.id"
                        class="-mb-[1px] flex items-center gap-1"
                    >
                        <div class="flex items-center gap-2">
                            <XCircleIcon class="h-[18px] w-[18px] min-w-[18px] text-red-400" />
                            <span class="text-xs text-zinc-700">{{ validation.message }}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex flex-col gap-2">
                <EditContentValidation
                    v-for="content in contentDocs"
                    :content="content"
                    :languages="languages"
                    :key="content._id"
                    @isValid="(val) => setOverallValidation(content._id, val)"
                    :contentPrev="contentPrev?.find((c) => c._id == content._id)"
                />
            </div>
            <div class="flex justify-center">
                <LanguageSelector
                    v-if="untranslatedLanguages.length > 0"
                    :languages="untranslatedLanguages"
                    :parent="parent"
                    :content="contentDocs"
                    @create-translation="(language) => emit('createTranslation', language)"
                />
            </div>
        </div>
    </div>
</template>
