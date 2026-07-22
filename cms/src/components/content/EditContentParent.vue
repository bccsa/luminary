<script setup lang="ts">
import LCard from "@/components/common/LCard.vue";
import LDialog from "@/components/common/LDialog.vue";
import { Cog6ToothIcon } from "@heroicons/vue/20/solid";
import {
    TagType,
    DocType,
    type TagDto,
    type LanguageDto,
    type ContentParentDto,
    type ContentDto,
    PostType,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import TagSelector from "./TagSelector.vue";
import GroupSelector from "../groups/GroupSelector.vue";
import { capitaliseFirstLetter } from "@/util/string";
import LToggle from "@/components/forms/LToggle.vue";
import { ExclamationCircleIcon, XCircleIcon } from "@heroicons/vue/20/solid";
import { validate, type Validation } from "./ContentValidator";
import { translatableLanguagesAsRef } from "@/globalConfig";

type Props = {
    docType: DocType;
    tagOrPostType: TagType | PostType;
    language?: LanguageDto;
    isParentDirty: boolean;
    disabled: boolean;
    newDocument?: boolean;
    /** All (non-deleted) translations of the post/tag being edited — used to gate the
     *  "link dates" toggle on translate access and to detect divergent existing dates. */
    content?: ContentDto[];
};
const props = defineProps<Props>();
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

// Convert alwaysOffline to a boolean for the toggle
const alwaysOffline = computed({
    get() {
        return parent.value?.alwaysOffline ?? false;
    },
    set(value: boolean) {
        if (parent.value) {
            parent.value.alwaysOffline = value;
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

// Non-deleted translations of this post/tag — the set the link-dates toggle reasons about.
const nonDeletedContent = computed(() => (props.content ?? []).filter((c) => !c.deleteReq));

// Setting the toggle is only allowed when the user has Translate access to every language
// that has a translation on this post — otherwise saving one translation could silently move
// the publish/expiry date of a sibling the user isn't authorised to touch. (The API enforces
// this independently on the date cascade itself; this is just the CMS-side reflection of it.)
const canManageLinkDates = computed(() => {
    const languageIds = nonDeletedContent.value.map((c) => c.language);
    if (languageIds.length === 0) return true;
    return languageIds.every((id) => translatableLanguagesAsRef.value.some((l) => l._id === id));
});

const showLinkDatesConfirm = ref(false);

const datesDiverge = () => {
    const items = nonDeletedContent.value;
    if (items.length < 2) return false;
    return items.some(
        (c) => c.publishDate !== items[0].publishDate || c.expiryDate !== items[0].expiryDate,
    );
};

const linkDates = computed({
    get() {
        return parent.value?.linkDates ?? false;
    },
    set(value: boolean) {
        if (!parent.value) return;
        // Turning it on for an existing post whose translations already have divergent
        // dates would silently overwrite them on the next translation save — confirm first.
        if (value && !props.newDocument && datesDiverge()) {
            showLinkDatesConfirm.value = true;
            return;
        }
        parent.value.linkDates = value;
    },
});

// Harmonize every translation's dates to the one currently being edited (falling back to the
// first translation), matching what the API cascade will do on the next translation save.
const confirmLinkDates = () => {
    showLinkDatesConfirm.value = false;
    if (!parent.value) return;
    parent.value.linkDates = true;

    const source =
        nonDeletedContent.value.find((c) => c.language === props.language?._id) ??
        nonDeletedContent.value[0];
    if (!source) return;
    for (const c of nonDeletedContent.value) {
        if (c === source) continue;
        c.publishDate = source.publishDate;
        c.expiryDate = source.expiryDate;
    }
};
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
                    v-if="isParentDirty"
                    class="flex items-center gap-2"
                    :class="{
                        'my-0.5': isParentDirty,
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

            <!-- Force-sync to app clients regardless of publishDate cutoff -->
            <div class="flex items-center justify-between gap-2">
                <span class="text-sm text-zinc-700">Always available offline</span>
                <LToggle v-model="alwaysOffline" :disabled="disabled" />
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

            <!-- When linked, saving any translation's publish/expiry date propagates it to every other translation sharing this parent. -->
            <div class="flex items-center justify-between gap-2">
                <span class="text-sm text-zinc-700">Link publish &amp; expiry dates</span>
                <LToggle v-model="linkDates" :disabled="disabled || !canManageLinkDates" />
            </div>
        </div>

        <slot name="supplementary" />
    </LCard>

    <LDialog
        v-model:open="showLinkDatesConfirm"
        title="Overwrite other translations' dates?"
        description="The translations of this post have different publish/expiry dates. Linking dates will overwrite all of them with the dates of the translation you're currently editing."
        primaryButtonText="Overwrite"
        secondaryButtonText="Cancel"
        context="danger"
        :primaryAction="confirmLinkDates"
        :secondaryAction="() => (showLinkDatesConfirm = false)"
    />
</template>
