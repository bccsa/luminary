<script setup lang="ts">
import EditContentValidation from "./EditContentValidation.vue";
import {
    type ContentDto,
    type Uuid,
    type LanguageDto,
    type ContentParentDto,
    TagType,
    PostType,
} from "luminary-shared";
import { computed, ref, watch, watchEffect } from "vue";
import { validate, type Validation } from "./ContentValidator";
import LanguageSelector from "./LanguageSelector.vue";
import {
    ExclamationCircleIcon,
    LanguageIcon,
    PlusIcon,
    XCircleIcon,
} from "@heroicons/vue/20/solid";
import _ from "lodash";
import LCard from "../common/LCard.vue";
import LButton from "../button/LButton.vue";
import { useRouter } from "vue-router";

type Props = {
    languages: LanguageDto[];
    dirty: boolean;
    existingParent: ContentParentDto | undefined;
    existingContent: ContentDto[] | undefined;
    canEdit: boolean;
    canTranslate: boolean;
    canPublish: boolean;
    untranslatedLanguages: LanguageDto[];
    tagOrPostType: TagType | PostType;
    canDelete: boolean;
};
const props = defineProps<Props>();
const editableParent = defineModel<ContentParentDto>("editableParent");
const editableContent = defineModel<ContentDto[]>("editableContent");

// Overall validation checking
const overallValidations = ref([] as Validation[]);
const overallIsValid = ref(true);

const showLanguageSelector = ref(false);
const isCardCollapsed = ref(false);

const router = useRouter();
const selectedLanguage = computed(() => {
    return props.languages.find(
        (l) => l.languageCode == router.currentRoute.value.params.languageCode,
    );
});

const lang = computed(() => {
    return isCardCollapsed.value
        ? props.languages?.filter((l) => l._id == selectedLanguage.value?._id)
        : props.languages;
});

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
    [editableParent, editableContent],
    ([_editableParent, _editableContent]) => {
        if (!_editableParent) return;

        validate(
            "At least one group membership is required",
            "groups",
            parentValidations.value,
            _editableParent,
            () => _editableParent.memberOf.length > 0,
        );

        validate(
            "At least one translation is required",
            "translations",
            parentValidations.value,
            _editableParent,
            () =>
                _editableContent != undefined &&
                _editableContent.filter((c) => !c.deleteReq).length > 0,
        );

        parentIsValid.value = parentValidations.value.every((v) => v.isValid);

        // Update overall validation
        let parentOverallValidation = overallValidations.value.find(
            (v) => v.id == _editableParent._id,
        );
        if (!parentOverallValidation) {
            parentOverallValidation = {
                id: _editableParent._id,
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
    <LCard
        class="bg-white"
        shadow="small"
        title="Translations"
        :icon="LanguageIcon"
        collapsible
        v-model:collapsed="isCardCollapsed"
    >
        <template #actions>
            <div class="relative flex flex-col items-end gap-2">
                <LButton
                    :icon="PlusIcon"
                    class="w-fit"
                    variant="muted"
                    @click.stop="showLanguageSelector = !showLanguageSelector"
                    data-test="add-translation-button"
                />

                <div v-if="untranslatedLanguages.length > 0" class="absolute right-24 z-10 mt-2">
                    <LanguageSelector
                        :languages="untranslatedLanguages"
                        :parent="editableParent"
                        :content="editableContent"
                        :showSelector="showLanguageSelector"
                        @create-translation="
                            (language) => {
                                emit('createTranslation', language);
                                showLanguageSelector = false;
                            }
                        "
                    />
                </div>
            </div>
        </template>

        <template #persistent>
            <div class="flex flex-col gap-2" :class="{ 'mb-1': isCardCollapsed }">
                <EditContentValidation
                    v-for="content in editableContent?.filter((c) => !c.deleteReq)"
                    :editableContent="content"
                    :languages="lang"
                    :key="content._id"
                    @isValid="(val) => setOverallValidation(content._id, val)"
                    :existingContent="existingContent?.find((c) => c._id == content._id)"
                    :can-delete="canDelete"
                    :isCardCollapsed="isCardCollapsed"
                />
            </div>
        </template>

        <div class="flex flex-col gap-2">
            <div
                v-if="editableParent && !_.isEqual(editableParent, existingParent)"
                class="flex items-center gap-2"
            >
                <p>
                    <ExclamationCircleIcon class="h-4 w-4 text-yellow-400" />
                </p>
                <p class="text-xs text-zinc-700">
                    Unsaved changes to {{ tagOrPostType }}'s settings.
                </p>
            </div>
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
        </div>
    </LCard>
</template>
