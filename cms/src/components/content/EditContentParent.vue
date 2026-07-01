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
    newDocument?: boolean;
};
const props = defineProps<Props>();
const parent = defineModel<ContentParentDto>("parent");

// ArrayBuffer-safe deep compare: parents can carry binary upload payloads
// (imageData.uploadData[].fileData), and lodash's default isEqual throws
// "incompatible receiver" reading byteLength on a cross-realm/reactive buffer.
const parentChanged = computed(
    () =>
        !!parent.value &&
        !_.isEqualWith(parent.value, props.existingParent, (x, y) => {
            const isBuf = (v: unknown) =>
                Object.prototype.toString.call(v) === "[object ArrayBuffer]";
            if (isBuf(x) || isBuf(y)) {
                try {
                    return (x as ArrayBuffer)?.byteLength === (y as ArrayBuffer)?.byteLength;
                } catch {
                    return true; // cross-realm buffer; treat as unchanged
                }
            }
            return undefined;
        }),
);

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

// Convert showComingSoon to a boolean for the toggle
const showComingSoon = computed({
    get() {
        return parent.value?.showComingSoon ?? false;
    },
    set(value: boolean) {
        if (parent.value) {
            parent.value.showComingSoon = value;
        }
    },
});

const useVerticalTileLayout = computed({
    get() {
        return parent.value?.useVerticalTileLayout ?? false;
    },
    set(value: boolean) {
        if (parent.value) {
            parent.value.useVerticalTileLayout = value;
        }
    },
});
</script>

<template>
    <LCard
        :title="`${capitaliseFirstLetter(tagOrPostType)} settings`"
        :icon="Cog6ToothIcon"
        :collapsed="newDocument ? false : true"
        collapsible
        v-if="parent"
        class="bg-white"
    >
        <template #persistent="{ collapsed }">
            <div class="flex flex-col px-2">
                <div
                    v-if="parentChanged"
                    class="flex items-center gap-2"
                    :class="{
                        'my-0.5': parentChanged,
                        'pb-1.5': collapsed && parentIsValid,
                    }"
                >
                    <ExclamationCircleIcon class="size-[18px] min-w-[18px] shrink-0 text-yellow-400" />
                    <p class="text-xs text-zinc-700">
                        Unsaved changes to {{ tagOrPostType }}'s settings.
                    </p>
                </div>
                <div v-if="!parentIsValid">
                    <div class="flex flex-col gap-0.5 pb-1">
                        <div
                            v-for="validation in parentValidations.filter((v) => !v.isValid)"
                            :key="validation.id"
                            class="-mb-[1px] flex items-center gap-2"
                            :class="{ 'pb-1.5': collapsed && !parentIsValid }"
                        >
                            <XCircleIcon class="size-[18px] min-w-[18px] shrink-0 text-red-400" />
                            <span class="text-xs text-zinc-700">{{ validation.message }}</span>
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
            class="mb-0"
            :disabled="disabled"
            :key="language?._id"
        />

        <!-- Display options — grouped under a divider with uniform spacing and lighter,
             regular-weight labels so they read as quick on/off settings rather than
             competing with the bold Group/Categories/Topics section headers above. -->
        <div class="mt-4 flex flex-col gap-2.5 border-t border-zinc-200 pt-3">
            <div class="flex items-center justify-between gap-2">
                <span class="text-sm text-zinc-700">Show publish date</span>
                <LToggle v-model="parent.publishDateVisible" :disabled="disabled" />
            </div>

            <!-- Show as "Coming soon" when scheduled with a future publish date. -->
            <div class="flex items-center justify-between gap-2">
                <span class="text-sm text-zinc-700">Show as Coming soon</span>
                <LToggle v-model="showComingSoon" :disabled="disabled" />
            </div>

            <div
                v-if="docType == DocType.Tag && parent && (parent as TagDto).pinned != undefined"
                class="flex items-center justify-between gap-2"
            >
                <span class="text-sm text-zinc-700">Pinned</span>
                <LToggle v-model="pinned" :disabled="disabled" />
            </div>

            <div
                v-if="
                    docType == DocType.Tag &&
                    (tagOrPostType === TagType.Category || tagOrPostType === TagType.Topic)
                "
                class="flex items-center justify-between gap-2"
            >
                <span class="text-sm text-zinc-700">Vertical Tile</span>
                <LToggle v-model="useVerticalTileLayout" :disabled="disabled" />
            </div>
        </div>

        <slot name="supplementary" />
    </LCard>
</template>
