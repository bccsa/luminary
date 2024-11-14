<script setup lang="ts">
import EditContentValidation from "./EditContentValidation.vue";
import {
    type ContentDto,
    type Uuid,
    type LanguageDto,
    AclPermission,
    DocType,
    verifyAccess,
    PublishStatus,
    db,
    type ContentParentDto,
} from "luminary-shared";
import { computed, ref, watch, watchEffect } from "vue";
import { validate, type Validation } from "./ContentValidator";
import { sortByName } from "@/util/sortByName";
import LanguageSelector from "./LanguageSelector.vue";
import { ExclamationCircleIcon, XCircleIcon } from "@heroicons/vue/20/solid";

type Props = {
    languages: LanguageDto[];
    dirty: boolean;
    parentPrev: ContentParentDto | undefined;
    contentPrev: ContentDto[] | undefined;
    canEdit: boolean;
    canTranslateOrPublish: boolean;
};
const props = defineProps<Props>();
const parent = defineModel<ContentParentDto>("parent");
const contentDocs = defineModel<ContentDto[]>("contentDocs");

const untranslatedLanguages = computed(() => {
    if (!contentDocs.value) {
        return [];
    }

    return props.languages
        .filter(
            (l) =>
                !contentDocs.value?.find((c) => c.language == l._id) &&
                verifyAccess(l.memberOf, DocType.Language, AclPermission.Translate),
        )
        .sort(sortByName);
});

const createTranslation = (language: LanguageDto) => {
    const newContent: ContentDto = {
        _id: db.uuid(),
        type: DocType.Content,
        updatedTimeUtc: Date.now(),
        memberOf: [],
        parentId: parent.value?._id as Uuid,
        parentType: parent.value?.docType as DocType.Post | DocType.Tag,
        language: language._id,
        status: PublishStatus.Draft,
        title: `Translation for ${language.name}`,
        slug: "",
        parentTags: [],
    };
    contentDocs.value?.push(newContent);
};

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

const emit = defineEmits(["updateIsValid"]);

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

        if (newContentDocs && newContentDocs.length > 0 && newContentDocs[0].status) {
            const contentDocStatus = newContentDocs[0].status;
            if (contentDocStatus !== PublishStatus.Draft) {
                validate(
                    "The default image must be set",
                    "image",
                    parentValidations.value,
                    newParent,
                    () =>
                        newParent.imageData != undefined &&
                        (newParent.imageData.fileCollections.length > 0 ||
                            (Array.isArray(newParent.imageData.uploadData) &&
                                newParent.imageData.uploadData?.length > 0)),
                );
            }
        }

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
                v-if="!canTranslateOrPublish || !canEdit"
                class="mb-1 rounded-md bg-zinc-50 p-4 shadow"
            >
                <span v-if="!canTranslateOrPublish" class="mb-1 flex gap-1 text-xs text-zinc-600">
                    <ExclamationCircleIcon class="h-4 text-red-400" /> You do not have permission to
                    translate and/or publish content.</span
                >
                <span v-if="!canEdit" class="flex gap-1 text-xs text-zinc-600">
                    <ExclamationCircleIcon class="h-4 text-red-400" /> You do not have permission to
                    edit content.</span
                >
            </div>
            <div v-if="!parentIsValid" class="mb-2 rounded-md bg-zinc-50 p-4 shadow">
                <span class="text-sm"
                    >Errors were found in your {{ parent?.type }}'s settings:</span
                >
                <div class="mt-1 flex flex-col gap-0.5">
                    <div
                        v-for="validation in parentValidations.filter((v) => !v.isValid)"
                        :key="validation.id"
                        class="-mb-[1px] flex items-center gap-1"
                    >
                        <p class="flex items-center gap-1">
                            <XCircleIcon class="h-[18px] text-red-400" />
                            <span class="text-xs text-zinc-700">{{ validation.message }}</span>
                        </p>
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
                    @create-translation="createTranslation"
                />
            </div>
        </div>
    </div>
</template>
