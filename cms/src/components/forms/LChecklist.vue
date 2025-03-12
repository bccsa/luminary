<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import {
    Combobox,
    ComboboxButton,
    ComboboxInput,
    ComboboxOption,
    ComboboxOptions,
} from "@headlessui/vue";
import LTag from "@/components/content/LTag.vue";

type ChecklistOption = { label: string; value: string | number };

type Props = {
    options: ChecklistOption[];
    disabled?: boolean;
    icon?: Component | Function;
};
const props = withDefaults(defineProps<Props>(), {
    disabled: false,
});
const selectedValues = defineModel<Array<string | number>>("selectedValues");

const query = ref("");
const filtered = computed(() =>
    query.value === ""
        ? props.options
        : props.options.filter((o) => {
              return o.label.toLowerCase().includes(query.value.toLowerCase());
          }),
);

const selectedOptions = ref<ChecklistOption[]>([]);
watch(
    [selectedValues, props],
    () => {
        if (!selectedValues.value) return;
        selectedOptions.value = props.options.filter((t) =>
            selectedValues.value?.some((s) => s == t.value),
        );
    },
    { deep: true },
);

const isSelected = computed(() => {
    return (option: ChecklistOption) => {
        return selectedValues.value?.some((t) => t == option.value);
    };
});

const onSelected = (option: ChecklistOption) => {
    /*The action that should happen if @update:modelValue is triggered in "Combobox"
      This was implemented inline but moved here to make it a function that can be triggered.
    */
    if (!option || !selectedValues.value) return;
    if (!selectedValues.value.some((s) => s == option.value)) {
        selectedValues.value = [...selectedValues.value, option.value];
    }
};

/* This function was implemented for the @click on the "li" 
   that was triggered in the test but didn't trigger the "update:modelValue"
   in the headlessUI combobox. So the "selectedValues" remained *[]*
   This method ensures that "update:modelValue" is triggered. */
const onClick = (option: ChecklistOption) => {
    // Emit the value to trigger `update:modelValue`
    onSelected(option);
};
</script>

<template>
    <Combobox
        as="div"
        @update:modelValue="onSelected"
        nullable
        :disabled="disabled"
        data-test="selector"
    >
        <div class="relative">
            <ComboboxInput
                :class="[
                    ' h-10 w-full rounded-md border-0 bg-white py-1.5 pl-3 pr-10 text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400  focus:ring-2 focus:ring-inset focus:ring-zinc-950 sm:text-sm sm:leading-6',
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
                <ComboboxOptions
                    v-if="filtered.length > 0"
                    class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
                >
                    <ComboboxOption
                        v-for="content in filtered"
                        :key="content.value"
                        :value="content"
                        :disabled="isSelected(content)"
                        as="template"
                        v-slot="{ active, disabled }"
                    >
                        <li
                            @click="onClick(content)"
                            :class="[
                                'relative cursor-default select-none py-2 pl-3 pr-9',
                                { 'bg-zinc-100': active },
                                { 'text-zinc-900': active && !disabled },
                                { 'text-zinc-500': disabled },
                            ]"
                        >
                            <span class="block truncate" data-test="selector">
                                {{ content.label }}
                            </span>
                        </li>
                    </ComboboxOption>
                </ComboboxOptions>
            </transition>
        </div>
    </Combobox>

    <!-- Selected options -->
    <div class="mt-3 flex flex-wrap gap-3">
        <TransitionGroup
            enter-active-class="transition duration-150 delay-75"
            enter-from-class="transform scale-90 opacity-0"
            enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-100"
            leave-from-class="transform scale-100 opacity-100"
            leave-to-class="transform scale-90 opacity-0"
        >
            <LTag
                v-for="option in selectedOptions"
                :key="option.value"
                @remove="
                    () => {
                        if (!selectedValues) return;
                        selectedValues = selectedValues.filter((v) => v != option.value);
                    }
                "
                :disabled="disabled"
            >
                {{ options.find((o) => o.value == option.value)?.label }}
            </LTag>
        </TransitionGroup>
    </div>
</template>
