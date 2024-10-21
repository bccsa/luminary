<script setup lang="ts">
import { computed, ref, type Component } from "vue";
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import {
    Combobox,
    ComboboxButton,
    ComboboxInput,
    ComboboxLabel,
    ComboboxOption,
    ComboboxOptions,
} from "@headlessui/vue";
import { PostType } from "luminary-shared";
import { capitaliseFirstLetter } from "@/util/string";
import LTag from "./LTag.vue";

type Props = {
    label?: string;
    disabled?: boolean;
    icon?: Component | Function;
};
defineProps<Props>();

const postType = defineModel<PostType>("postType");

const availablePostTypes = Object.values(PostType);
const selectedPostType = ref<string | null>();
const query = ref("");

const emit = defineEmits<{
    (e: "update:postType", value: string | null): void;
}>();

// Handle selection of a post type
// Emit the update event when a post type is selected
const onPostTypeSelected = (type: string | null) => {
    emit("update:postType", type);
    selectedPostType.value = type;
    query.value = "";
};

const filteredPostTypes = computed(() =>
    query.value === ""
        ? availablePostTypes
        : availablePostTypes.filter((type) =>
              type.toLowerCase().includes(query.value.toLowerCase()),
          ),
);
</script>

<template>
    <div>
        <Combobox
            as="div"
            @update:modelValue="onPostTypeSelected"
            nullable
            :disabled="disabled"
            data-test="post-selector"
        >
            <ComboboxLabel class="block text-sm font-medium leading-6 text-zinc-900">
                {{ label }}
            </ComboboxLabel>
            <div class="relative mt-2">
                <ComboboxInput
                    :class="[
                        'w-full rounded-md border-0 bg-white py-1.5 pl-3 pr-10 text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-zinc-950 sm:text-sm sm:leading-6',
                        { 'hover:ring-zinc-400': !disabled, 'bg-zinc-100': disabled },
                    ]"
                    @change="query = $event.target.value"
                    placeholder="Type to select..."
                    v-model="query"
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
                    <!-- Available post types combo box -->
                    <ComboboxOptions
                        v-if="filteredPostTypes.length > 0"
                        class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
                    >
                        <ComboboxOption
                            v-for="type in filteredPostTypes"
                            :key="type"
                            :value="type"
                            as="template"
                            v-slot="{ active }"
                        >
                            <li
                                @click="onPostTypeSelected(type)"
                                :class="[
                                    'relative cursor-default select-none py-2 pl-3 pr-9',
                                    { 'bg-zinc-100': active },
                                    { 'text-zinc-900': active },
                                ]"
                            >
                                <span class="block truncate" data-test="post-selector">
                                    {{ capitaliseFirstLetter(type) }}
                                </span>
                            </li>
                        </ComboboxOption>
                    </ComboboxOptions>
                </transition>
            </div>
        </Combobox>

        <!-- Selected type -->
        <div class="mt-3 flex flex-wrap gap-3">
            <LTag v-if="postType">
                {{ capitaliseFirstLetter(postType) }}
            </LTag>
        </div>

        <!-- Display selected post type -->
        <div class="mt-3">
            <Transition
                enter-active-class="transition duration-75 delay-100"
                enter-from-class="transform scale-90 opacity-0 absolute"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75"
                leave-from-class="transform scale-100 opacity-100 absolute"
                leave-to-class="transform scale-90 opacity-0"
            >
                <div v-if="!postType" class="text-xs text-zinc-500">No post type selected</div>
            </Transition>
        </div>
    </div>
</template>
