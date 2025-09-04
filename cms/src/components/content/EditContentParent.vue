<script setup lang="ts">
import LCard from "@/components/common/LCard.vue";
import { Cog6ToothIcon } from "@heroicons/vue/20/solid";
import {
    TagType,
    DocType,
    type TagDto,
    type LanguageDto,
    type ContentParentDto,
    PostType,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import TagSelector from "./TagSelector.vue";
import GroupSelector from "../groups/GroupSelector.vue";
import { capitaliseFirstLetter } from "@/util/string";
import FormLabel from "@/components/forms/FormLabel.vue";
import LToggle from "@/components/forms/LToggle.vue";
import _ from "lodash";
import { ExclamationCircleIcon, XCircleIcon } from "@heroicons/vue/20/solid";
import { validate, type Validation } from "./ContentValidator";

type Props = {
    docType: DocType;
    tagOrPostType: TagType | PostType;
    language?: LanguageDto;
    existingParent: ContentParentDto | undefined;
    disabled: boolean;
};
defineProps<Props>();
const parent = defineModel<ContentParentDto>("parent");

// Parent validation
const parentValidations = ref([] as Validation[]);
const parentIsValid = ref(true);
const overallValidations = ref([] as Validation[]);
const overallIsValid = ref(true);

watch(
    [parent],
    ([_editableParent]) => {
        if (!_editableParent) return;

        validate(
            "At least one group membership is required",
            "groups",
            parentValidations.value,
            _editableParent,
            () => _editableParent.memberOf.length > 0,
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

// Convert the pinned property to a boolean for the toggle
const pinned = computed({
    get() {
        return (parent.value as TagDto).pinned ? true : false;
    },
    set(value: boolean) {
        if (parent.value) {
            (parent.value as TagDto).pinned = value ? 1 : 0;
        }
    },
});
</script>

<template>
    <LCard
        :title="`${capitaliseFirstLetter(tagOrPostType)} settings`"
        :icon="Cog6ToothIcon"
        collapsible
        v-if="parent"
        class="bg-white"
    >
        <template #persistent>
            <div class="flex flex-col gap-1 px-2 py-1.5">
                <div
                    v-if="parent && !_.isEqual(parent, existingParent)"
                    class="flex items-center gap-2"
                >
                    <p>
                        <ExclamationCircleIcon class="h-4 w-4 text-yellow-400" />
                    </p>
                    <p class="text-xs text-zinc-700">
                        Unsaved changes to {{ tagOrPostType }}'s settings.
                    </p>
                </div>
                <div v-if="!parentIsValid">
                    <div class="flex flex-col gap-0.5 pb-1">
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
        </template>
        <GroupSelector
            v-model:groups="parent.memberOf"
            :disabled="disabled"
            :docType="docType"
            class="mb-3"
        />

        <TagSelector
            v-model:parent="parent"
            :language="language"
            :tagType="TagType.Category"
            label="Categories"
            class="mb-3"
            :disabled="disabled"
            :key="language?._id"
        />

        <TagSelector
            v-model:parent="parent"
            :language="language"
            :tagType="TagType.Topic"
            label="Topics"
            class="mb-3"
            :disabled="disabled"
            :key="language?._id"
        />

        <!-- Toggle for Publish Date Visibility -->
        <div
            class="mt-3 flex items-center justify-between"
            :class="{ 'mb-2': docType !== DocType.Tag }"
        >
            <FormLabel>Show publish date</FormLabel>
            <LToggle v-model="parent.publishDateVisible" :disabled="disabled" />
        </div>

        <div
            v-if="docType == DocType.Tag && parent && (parent as TagDto).pinned != undefined"
            class="mt-3 flex items-center justify-between"
            :class="{ 'my-3': docType == DocType.Tag }"
        >
            <FormLabel>Pinned</FormLabel>
            <LToggle v-model="pinned" :disabled="disabled" />
        </div>
    </LCard>
</template>
