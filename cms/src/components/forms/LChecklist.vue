<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import LTag from "@/components/common/LTagHandler/LTag.vue";
import { onClickOutside } from "@vueuse/core";

type ChecklistOption = { label: string; value: string | number };

type Props = {
    options: ChecklistOption[];
    disabled?: boolean;
    icon?: Component | Function;
    isContentOverview?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    disabled: false,
    isContentOverview: false,
});
const selectedValues = defineModel<Array<string | number>>("selectedValues");
const openOptions = ref(false);
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

const isSelected = (option: ChecklistOption) => {
    return selectedValues.value?.some((t) => t == option.value);
};

const onSelected = (option: ChecklistOption) => {
    if (!option || !selectedValues.value) return;
    if (!selectedValues.value.some((s) => s == option.value)) {
        selectedValues.value = [...selectedValues.value, option.value];
    }
};

const onClick = (option: ChecklistOption) => {
    onSelected(option);
};

const checklist = ref<HTMLElement | undefined>(undefined);

onClickOutside(checklist, () => {
    openOptions.value = false;
});
</script>

<template>
    <div class="relative" ref="checklist" data-test="main-div">
        <div v-if="icon" class="absolute inset-y-0 left-3 flex items-center">
            <component
                :is="icon"
                :class="{
                    'text-zinc-400': !disabled,
                    'text-zinc-300': disabled,
                }"
                class="h-5 w-5"
            />
        </div>
        <input
            data-test="input"
            type="text"
            v-model="query"
            @focus="openOptions = true"
            placeholder="Type to select..."
            class="h-10 w-full rounded-md border-0 bg-white py-1.5 pl-10 pr-10 text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-zinc-950 sm:text-sm sm:leading-6"
            :class="icon ? 'pl-10' : 'pl-2'"
            :disabled="disabled"
        />
        <button
            class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none"
            @click="openOptions = !openOptions"
        >
            <ChevronUpDownIcon class="h-5 w-5 text-zinc-400" aria-hidden="true" />
        </button>

        <div v-if="openOptions" class="relative">
            <ul
                v-if="filtered.length > 0"
                data-test="options"
                class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
            >
                <li
                    v-for="content in filtered"
                    :key="content.value"
                    data-test="option"
                    @click="onClick(content)"
                    :class="[
                        'cursor-pointer select-none py-2 pl-3 pr-9 hover:bg-zinc-100',
                        { 'bg-zinc-100': isSelected(content) },
                        { 'text-zinc-900': !isSelected(content) },
                        { 'text-zinc-500': isSelected(content) },
                    ]"
                >
                    {{ content.label }}
                </li>
            </ul>
        </div>
    </div>

    <div v-if="!isContentOverview" class="mt-3 flex flex-wrap gap-3">
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
