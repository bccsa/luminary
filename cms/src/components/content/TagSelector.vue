<script setup lang="ts">
import { computed, ref, toRaw, toRefs } from "vue";
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import {
    Combobox,
    ComboboxButton,
    ComboboxInput,
    ComboboxLabel,
    ComboboxOption,
    ComboboxOptions,
} from "@headlessui/vue";
import type { Language, Tag } from "@/types";

type Props = {
    tags: Tag[];
    selectedTags: Tag[];
    language: Language;
    label?: string;
};

const props = withDefaults(defineProps<Props>(), {
    label: "Tags",
});

const { tags, selectedTags } = toRefs(props);

const emit = defineEmits(["select"]);

const isTagSelected = computed(() => {
    return (tagId: string) => {
        return selectedTags.value.some((t) => t._id == tagId);
    };
});

const query = ref("");
const filteredTags = computed(() =>
    query.value === ""
        ? tags.value
        : tags.value.filter((tag) => {
              return tag.content[0].title.toLowerCase().includes(query.value.toLowerCase());
          }),
);

const selectTag = (tag: Tag) => {
    query.value = "";

    emit("select", toRaw(tag));
};

const contentTitle = computed(() => {
    return (tag: Tag) => {
        const contentForSelectedLanguage = tag.content.find(
            (c) => c.language._id == props.language._id,
        );

        if (contentForSelectedLanguage) {
            return contentForSelectedLanguage.title;
        }

        return tag.content[0].title;
    };
});
</script>

<template>
    <Combobox as="div" @update:modelValue="(tag: Tag) => selectTag(tag)" nullable>
        <ComboboxLabel class="block text-sm font-medium leading-6 text-gray-900">
            {{ label }}
        </ComboboxLabel>
        <div class="relative mt-2">
            <ComboboxInput
                class="w-full rounded-md border-0 bg-white py-1.5 pl-3 pr-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 hover:ring-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-950 sm:text-sm sm:leading-6"
                @change="query = $event.target.value"
                placeholder="Type to select..."
            />
            <ComboboxButton
                class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none"
            >
                <ChevronUpDownIcon class="h-5 w-5 text-gray-400" aria-hidden="true" />
            </ComboboxButton>

            <transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-out"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
            >
                <ComboboxOptions
                    v-if="filteredTags.length > 0"
                    class="fixed z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
                >
                    <ComboboxOption
                        v-for="tag in filteredTags"
                        :key="tag._id"
                        :value="tag"
                        :disabled="isTagSelected(tag._id)"
                        as="template"
                        v-slot="{ active, disabled }"
                    >
                        <li
                            :class="[
                                'relative cursor-default select-none py-2 pl-3 pr-9',
                                { 'bg-gray-100': active },
                                { 'text-gray-900': active && !disabled },
                                { 'text-gray-500': disabled },
                            ]"
                        >
                            <span class="block truncate" data-test="tag-selector">
                                {{ contentTitle(tag) }}
                            </span>
                        </li>
                    </ComboboxOption>
                </ComboboxOptions>
            </transition>
        </div>
    </Combobox>
</template>
