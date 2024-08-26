<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import LBadge from "@/components/common/LBadge.vue";
import LCard from "@/components/common/LCard.vue";
import EditContentValidation from "./EditContentValidation.vue";
import { ArrowUpOnSquareIcon } from "@heroicons/vue/24/outline";
import { XCircleIcon, ExclamationCircleIcon } from "@heroicons/vue/16/solid";
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
import { computed, ref, watch } from "vue";
import { validate, type Validation } from "./ContentValidator";
import _ from "lodash";
import { sortByName } from "@/util/sortByName";
import LanguageSelector from "./LanguageSelector.vue";

type Props = {
    languages: LanguageDto[];
    localChange: boolean;
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

const emit = defineEmits<{
    (e: "save"): void;
}>();

const isParentDirty = computed(() => {
    return _.isEqual(parent.value, props.parentPrev);
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

// Parent validation
const parentValidations = ref([] as Validation[]);
const parentIsValid = ref(true);
watch(
    [parent, contentDocs],
    ([_parent, _contentDocs]) => {
        if (!_parent) return;

        validate(
            "At least one group is required",
            "groups",
            parentValidations.value,
            _parent,
            () => _parent.memberOf.length > 0,
        );

        validate(
            "The default image must be set",
            "image",
            parentValidations.value,
            _parent,
            () => _parent.image != "" && _parent.image != undefined,
        );

        validate(
            "At least one translation is required",
            "translations",
            parentValidations.value,
            _parent,
            () => _contentDocs != undefined && _contentDocs.length > 0,
        );

        parentIsValid.value = parentValidations.value.every((v) => v.isValid);

        // Update overall validation
        let parentOverallValidation = overallValidations.value.find((v) => v.id == _parent._id);
        if (!parentOverallValidation) {
            parentOverallValidation = {
                id: _parent._id,
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
    <LCard :showFooter="true">
        <div class="flex gap-4">
            <LBadge v-if="localChange" variant="warning">Offline changes</LBadge>

            <div class="flex-1"></div>
            <LButton
                type="button"
                @click="emit('save')"
                data-test="save-button"
                :disabled="!overallIsValid || !dirty"
                :icon="ArrowUpOnSquareIcon"
                variant="primary"
            >
                Save
            </LButton>
        </div>

        <template #footer>
            <div v-show="true" class="flex flex-col gap-2">
                <p v-if="!overallIsValid && !isParentDirty" class="text-sm text-zinc-700">
                    There are some errors that prevent saving
                </p>

                <div class="flex flex-col">
                    <div class="flex flex-col gap-2" v-if="!isParentDirty">
                        <span class="text-sm text-zinc-900"> General </span>
                        <div class="flex items-center gap-2">
                            <p>
                                <ExclamationCircleIcon class="h-4 w-4 text-yellow-400" />
                            </p>
                            <p class="h-4 text-xs text-zinc-700">Unsaved changes</p>
                        </div>
                    </div>

                    <div
                        v-for="validation in parentValidations.filter((v) => !v.isValid)"
                        :key="validation.id"
                        class="flex items-center gap-2"
                    >
                        <p>
                            <XCircleIcon class="h-4 w-4 text-red-400" />
                        </p>
                        <p class="h-4 text-xs text-zinc-700">{{ validation.message }}</p>
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
        </template>
    </LCard>
</template>
