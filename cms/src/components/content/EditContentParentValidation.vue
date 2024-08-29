<script setup lang="ts">
import EditContentValidation from "./EditContentValidation.vue";
import {
    type PostDto,
    type TagDto,
    type ContentDto,
    type Uuid,
    type LanguageDto,
    AclPermission,
    DocType,
    verifyAccess,
    PublishStatus,
    db,
} from "luminary-shared";
import { computed, ref, watch, watchEffect } from "vue";
import { validate, type Validation } from "./ContentValidator";
import { sortByName } from "@/util/sortByName";
import LanguageSelector from "./LanguageSelector.vue";

type Props = {
    languages: LanguageDto[];
    dirty: boolean;
    parentPrev: PostDto | TagDto | undefined;
    contentPrev: ContentDto[] | undefined;
};
const props = defineProps<Props>();
const parent = defineModel<PostDto | TagDto>("parent");
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
            "At least one group is required",
            "groups",
            parentValidations.value,
            newParent,
            () => newParent.memberOf.length > 0,
        );

        validate(
            "The default image must be set",
            "image",
            parentValidations.value,
            newParent,
            () => newParent.image != undefined && newParent.image.trim() != "",
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
