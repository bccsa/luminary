<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import {
    Combobox,
    ComboboxButton,
    ComboboxInput,
    ComboboxLabel,
    ComboboxOption,
    ComboboxOptions,
} from "@headlessui/vue";
import {
    db,
    AclPermission,
    DocType,
    TagType,
    type ContentDto,
    type LanguageDto,
    type TagDto,
    verifyAccess,
    type ContentParentDto,
} from "luminary-shared";
import LTag from "./LTag.vue";
import { watchDeep } from "@vueuse/core";

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
const tags = db.whereTypeAsRef<TagDto[]>(DocType.Tag, [], props.tagType);

const tagsContent = ref<ContentDto[]>([]);
watch(tags, async () => {
    const pList: any[] = [];
    tags.value.forEach((tag) => {
        // Filter tags based on access before proceeding, and exclude the the tag itself (if parent is a tag)
        if (
            tag._id != parent.value?._id &&
            verifyAccess(tag.memberOf, DocType.Tag, AclPermission.Assign, "any")
        ) {
            pList.push(
                // We are getting the content as non-reactive, meaning that if someone else would change
                // the content of an existing tag, it will not automatically update in the tag selector.
                db.whereParent(tag._id, DocType.Tag).then((content) => {
                    if (content.length == 0) return;

                    const preferred = content.find((c) => c.language == props.language?._id);
                    const c = preferred ? preferred : content[0];

                    const existingIndex = tagsContent.value.findIndex((tc) => tc._id == c._id);
                    if (existingIndex >= 0) {
                        tagsContent.value[existingIndex] = c;
                        return;
                    }

                    tagsContent.value.push(c);
                }),
            );
        }
    });

    await Promise.all(pList);
});

const query = ref("");
const filteredTagsContent = computed(() =>
    query.value === ""
        ? tagsContent.value
        : tagsContent.value.filter((content) => {
              return content.title.toLowerCase().includes(query.value.toLowerCase());
          }),
);

const selectedTagsByType = ref<TagDto[]>([]);
watchDeep([parent, tags], () => {
    if (!parent.value) return;
    // The tags list is already filtered by the tagType
    selectedTagsByType.value = tags.value.filter((t) => parent.value?.tags.includes(t._id));
});

const isTagSelected = computed(() => {
    return (tagId: string) => {
        return parent.value?.tags.some((t) => t == tagId);
    };
});

const onTagSelected = (tagContent: ContentDto) => {
    /*The action that should happen if @update:modelValue is triggered in "Combobox"
      This was implemented inline but moved here to make it a function that can be triggered.
    */
    if (!tagContent || !parent.value?.tags) return;
    if (!parent.value.tags.includes(tagContent.parentId)) {
        parent.value.tags = [...parent.value.tags, tagContent.parentId];
    }
};

/* This function was implemented for the @click on the "li" 
   that was triggered in the test but didn't trigger the "update:modelValue"
   in the headlessUI combobox. So the "parent.tags" remained *[]*
   This method ensures that "update:modelValue" is triggered. */
const onTagClick = (tagContent: ContentDto) => {
    // Emit the value to trigger `update:modelValue`
    onTagSelected(tagContent);
};
</script>

<template>
    <div>
        <Combobox
            as="div"
            @update:modelValue="onTagSelected"
            nullable
            :disabled="disabled"
            data-test="tag-selector"
        >
            <ComboboxLabel class="block text-sm font-medium leading-6 text-zinc-900">
                {{ label }}
            </ComboboxLabel>
            <div class="relative mt-2">
                <ComboboxInput
                    :class="[
                        'w-full rounded-md border-0 bg-white py-1.5 pl-3 pr-10 text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400  focus:ring-2 focus:ring-inset focus:ring-zinc-950 sm:text-sm sm:leading-6',
                        { 'hover:ring-zinc-400': !disabled, 'bg-zinc-100': disabled },
                    ]"
                    @change="query = $event.target.value"
                    placeholder="Type to select..."
                />
                <ComboboxButton
                    class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none"
                >
                    <ChevronUpDownIcon class="h-5 w-5 text-zinc-400" aria-hidden="true" />
                </ComboboxButton>

                <transition
                    enter-active-class="transition duration-100 ease-out"
                    enter-from-class="transform scale-95 opacity-0"
                    enter-to-class="transform scale-100 opacity-100"
                    leave-active-class="transition duration-75 ease-out"
                    leave-from-class="transform scale-100 opacity-100"
                    leave-to-class="transform scale-95 opacity-0"
                >
                    <!-- Available tags combo box -->
                    <ComboboxOptions
                        v-if="filteredTagsContent.length > 0"
                        class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
                    >
                        <ComboboxOption
                            v-for="content in filteredTagsContent"
                            :key="content.parentId"
                            :value="content"
                            :disabled="isTagSelected(content.parentId)"
                            as="template"
                            v-slot="{ active, disabled }"
                        >
                            <li
                                @click="onTagClick(content)"
                                :class="[
                                    'relative cursor-default select-none py-2 pl-3 pr-9',
                                    { 'bg-zinc-100': active },
                                    { 'text-zinc-900': active && !disabled },
                                    { 'text-zinc-500': disabled },
                                ]"
                            >
                                <span class="block truncate" data-test="tag-selector">
                                    {{ content.title }}
                                </span>
                            </li>
                        </ComboboxOption>
                    </ComboboxOptions>
                </transition>
            </div>
        </Combobox>

        <!-- Selected tags -->
        <div class="mt-3 flex flex-wrap gap-3">
            <TransitionGroup
                enter-active-class="transition duration-150 delay-75"
                enter-from-class="transform scale-90 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-100"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-90 opacity-0"
            >
                <!-- Filter on tags of type tagType by comparing the parent.tags with the filtered list of tags -->
                <LTag
                    v-for="tag in selectedTagsByType"
                    :key="tag._id"
                    @remove="
                        () => {
                            if (!parent) return;
                            parent.tags = parent.tags.filter((t) => t != tag._id);
                        }
                    "
                    :disabled="disabled"
                >
                    {{ tagsContent.find((tc) => tc.parentId == tag._id)?.title }}
                </LTag>
            </TransitionGroup>
        </div>
        <!-- Message when no tags are selected -->
        <Transition
            enter-active-class="transition duration-75 delay-100"
            enter-from-class="transform scale-90 opacity-0 absolute"
            enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75"
            leave-from-class="transform scale-100 opacity-100 absolute"
            leave-to-class="transform scale-90 opacity-0"
        >
            <div v-if="selectedTagsByType.length == 0" class="text-xs text-zinc-500">
                No {{ label.toLowerCase() }} selected
            </div>
        </Transition>
    </div>
</template>
