<script setup lang="ts">
import { computed, ref, type Component } from "vue";
import {
    AclPermission,
    DocType,
    TagType,
    type ContentDto,
    type LanguageDto,
    verifyAccess,
    type ContentParentDto,
    useHybridQuery,
} from "luminary-shared";
import { getPreferredContentLanguage } from "@/util/getPreferredContentLanguage";
import LCombobox, { type ComboboxOption } from "@/components/forms/LCombobox.vue";
import { TagIcon, ChevronRightIcon } from "@heroicons/vue/24/outline";

type Props = {
    tagType: TagType;
    language?: LanguageDto;
    label?: string;
    disabled?: boolean;
    icon?: Component | Function;
};
const props = withDefaults(defineProps<Props>(), {
    label: "Tags",
    disabled: false,
});
const parent = defineModel<ContentParentDto>("parent");

// Tag content for this tagType (Content is synced → Dexie-first on the [type+parentTagType]
// index). The thunk auto-tracks `props.tagType`. The per-language selection is a cross-doc
// condition (depends on availableTranslations), kept as a client-side computed below.
const tagContent = useHybridQuery<ContentDto>(
    () => ({ selector: { type: DocType.Content, parentTagType: props.tagType } }),
    { live: true },
);

const tags = computed<ContentDto[]>(() => {
    if (!parent.value || !props.language) return [];
    return tagContent.value
        .filter(
            (doc) =>
                getPreferredContentLanguage(
                    doc.availableTranslations || [],
                    props.language?._id,
                ) == doc.language,
        )
        .sort((a, b) => (b.publishDate ?? 0) - (a.publishDate ?? 0));
});

const assignable = computed(() =>
    tags.value.filter(
        (tag) =>
            verifyAccess(tag.memberOf, DocType.Tag, AclPermission.Assign, "any") &&
            tag.parentId !== parent.value?._id,
    ),
);

const assignableOptions = computed<ComboboxOption[]>(() =>
    assignable.value.map((tag) => ({
        id: tag._id,
        label: tag.title,
        value: tag.parentId,
    })),
);

// Options to be shown as labels
const selectedOptions = computed(
    () =>
        (parent.value?.tags
            .map((tagId) => {
                const tag = tags.value.find((t) => t.parentId === tagId);

                if (tag) {
                    return {
                        id: tag.parentId,
                        label: tag.title,
                        value: tag.parentId,
                        isVisible: true,
                        isRemovable: verifyAccess(
                            tag.memberOf,
                            DocType.Tag,
                            AclPermission.Assign,
                            "any",
                        ),
                    };
                }
            })
            .filter((o) => o !== undefined) as ComboboxOption[]) || [],
);

const showEditModal = ref(false);
</script>

<template>
    <div>
        <LCombobox
            v-if="parent"
            :label="label"
            :disabled="disabled"
            :labelIcon="TagIcon"
            :options="assignableOptions"
            v-model:selected-options="parent.tags"
            :selected-labels="selectedOptions"
            :show-selected-labels="true"
            :showSelectedInDropdown="false"
            :sort-options="false"
            v-model:showEditModal="showEditModal"
        >
            <template #actions>
                <button
                    @click="showEditModal = true"
                    type="button"
                    :disabled="disabled"
                    data-test="edit-group"
                    class="flex items-center rounded-lg text-sm hover:bg-zinc-300/50"
                >
                    edit
                    <ChevronRightIcon class="-ml-1 h-4 w-4 text-zinc-600" />
                </button>
            </template>
        </LCombobox>

        <!-- Message when no tags are selected -->
        <Transition
            enter-active-class="transition duration-75 delay-100"
            enter-from-class="transform scale-90 opacity-0 absolute"
            enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75"
            leave-from-class="transform scale-100 opacity-100 absolute"
            leave-to-class="transform scale-90 opacity-0"
        >
            <div v-if="selectedOptions.length == 0" class="text-xs text-zinc-500">
                No {{ label.toLowerCase() }} selected
            </div>
        </Transition>
    </div>
</template>
