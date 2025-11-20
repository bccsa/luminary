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
import { computed, ref, watch, watchEffect, onMounted, onUnmounted } from "vue";
import { validate, type Validation } from "./ContentValidator";
import LanguageSelector from "./LanguageSelector.vue";
import {
    ExclamationCircleIcon,
    LanguageIcon,
    PlusIcon,
    XCircleIcon,
} from "@heroicons/vue/20/solid";
import LCard from "../common/LCard.vue";
import LButton from "../button/LButton.vue";
import { useRouter } from "vue-router";
import { isSmallScreen } from "@/globalConfig";

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
const isLanguageSelectorCollapsed = ref(false);
const languageSelector = ref<HTMLElement>();

// Check if card is close to topbar
const checkTopbarCollision = () => {
    if (!languageSelector.value) return;

    // Only run on small screens or when testing
    if (!isSmallScreen.value && import.meta.env.MODE !== "test") return;

    const topbar = document.querySelector('[class*="sticky top-0 z-40"]') as HTMLElement;
    if (!topbar) return;

    const topbarBottom = topbar.getBoundingClientRect().bottom;
    const cardTop = languageSelector.value.getBoundingClientRect().top;
    const distance = cardTop - topbarBottom;

    // Collapse if card is within 25px of topbar (give more buffer)
    const shouldCollapse = distance <= 25;
    isLanguageSelectorCollapsed.value = shouldCollapse;
};

onMounted(() => {
    // Run on small screens or when testing
    if (!isSmallScreen.value && import.meta.env.MODE !== "test") return;

    // Add window scroll listener for topbar collision check
    window.addEventListener("scroll", checkTopbarCollision, { passive: true });

    // Also listen to any scroll events that might affect positioning
    document.addEventListener("scroll", checkTopbarCollision, { passive: true, capture: true });

    // Initial check
    setTimeout(() => checkTopbarCollision(), 100);
});

onUnmounted(() => {
    window.removeEventListener("scroll", checkTopbarCollision);
});

const router = useRouter();
const selectedLanguage = computed(() => {
    return props.languages.find(
        (l) => l.languageCode == router.currentRoute.value.params.languageCode,
    );
});

const lang = computed(() => {
    return isLanguageSelectorCollapsed.value
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
    <div ref="languageSelector">
        <LCard
            class="bg-white"
            shadow="small"
            title="Translations"
            :icon="LanguageIcon"
            collapsible
            v-model:collapsed="isLanguageSelectorCollapsed"
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
                    <div v-if="untranslatedLanguages.length > 0" class="absolute right-0 z-50 mt-5">
                        <LanguageSelector
                            :languages="untranslatedLanguages"
                            :parent="editableParent"
                            :content="editableContent"
                            :show-selector="showLanguageSelector"
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
                <div class="flex flex-col gap-2" :class="{ 'mb-3': isLanguageSelectorCollapsed }">
                    <EditContentValidation
                        v-for="content in editableContent?.filter((c) => !c.deleteReq)"
                        :editableContent="content"
                        :languages="lang"
                        :key="content._id"
                        @isValid="(val) => setOverallValidation(content._id, val)"
                        :existingContent="existingContent?.find((c) => c._id == content._id)"
                        :can-delete="canDelete"
                        :isCardCollapsed="isLanguageSelectorCollapsed"
                    />
                </div>
            </template>

            <div class="flex flex-col gap-2">
                <div
                    v-if="!(canTranslate || canPublish) || !canEdit"
                    class="mb-1 rounded-md bg-zinc-50 p-2 shadow"
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
                        <ExclamationCircleIcon class="h-4 min-h-4 w-4 min-w-4 text-red-400" />No
                        edit permission</span
                    >
                </div>
                <div v-if="!parentIsValid">
                    <div class="my-1 flex flex-col gap-0.5">
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
    </div>
</template>
