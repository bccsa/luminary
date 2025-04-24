<script setup lang="ts">
import { computed, ref, watch, type StyleValue } from "vue";
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import LTag from "../content/LTag.vue";
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import FormLabel from "./FormLabel.vue";
import LInput from "./LInput.vue";
import { onClickOutside } from "@vueuse/core";

const { attrsWithoutStyles } = useAttrsWithoutStyles();

export type ComboboxOption = {
    id: string | number;
    label: string;
    value: any;
    isVisible?: boolean;
    isRemovable?: boolean;
};

type Props = {
    label?: string;
    disabled?: boolean;
    options: ComboboxOption[];
    showSelectedInDropdown?: boolean;
    selectedLabels?: ComboboxOption[];
};

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
    showSelectedInDropdown: true,
});

const selectedOptions = defineModel<Array<string | number>>("selectedOptions", { required: true });

const inputElement = ref<HTMLElement>();
const comboboxElement = ref();
const dropdown = ref<HTMLElement>();
const showDropdown = ref(false);

const optionsList = computed(() =>
    props.options.map((o) => ({
        ...o,
        selected: selectedOptions.value?.includes(o.id),
        highlighted: false,
    })),
);

const query = ref("");
const filtered = computed(() =>
    optionsList.value.filter((o) => {
        if (!props.showSelectedInDropdown && o.selected) return false;
        return o.label.toLowerCase().includes(query.value.toLowerCase());
    }),
);

const handleChevronBtnClick = () => {
    if (!inputElement.value) return;
    inputElement.value.focus();
    showDropdown.value = !showDropdown.value;
};

onClickOutside(comboboxElement, () => (showDropdown.value = false));

const highlightedIndex = ref(-1);

watch(showDropdown, () => {
    if (!showDropdown.value) {
        highlightedIndex.value = -1;
    }
});

const selectedLabels = computed(() => {
    if (props.selectedLabels) return props.selectedLabels;
    return optionsList.value.filter((o) => o.selected);
});
</script>

<template>
    <div
        ref="comboboxElement"
        class="relative"
        :class="$attrs['class']"
        :style="$attrs['style'] as StyleValue"
    >
        <FormLabel v-if="label"> {{ label }} </FormLabel>
        <div class="relative mt-2 flex w-full rounded-md" v-bind="attrsWithoutStyles">
            <LInput
                @click="showDropdown = !showDropdown"
                v-model="query"
                ref="inputElement"
                class="w-full"
                placeholder="Type to select..."
                name="option-search"
                @keydown.enter="
                    () => {
                        // Add the highlighted option to the selected options on enter
                        if (highlightedIndex >= 0) {
                            selectedOptions.push(filtered[highlightedIndex].value);
                            query = '';
                            showDropdown = false;
                            return;
                        }

                        // If no option is highlighted, add the first option to the selected options
                        if (filtered.length > 0) {
                            selectedOptions.push(filtered[0].value);
                            query = '';
                            showDropdown = false;
                        }
                    }
                "
                autocomplete="off"
                @keydown.escape="
                    () => {
                        query = '';
                        showDropdown = false;
                    }
                "
                @keydown.down="
                    () => {
                        if (!showDropdown) showDropdown = true;
                        if (highlightedIndex < filtered.length - 1) highlightedIndex++;
                        dropdown?.children[highlightedIndex].scrollIntoView({
                            block: 'nearest',
                            behavior: 'smooth',
                        });
                    }
                "
                @keydown.up="
                    () => {
                        if (highlightedIndex > 0) highlightedIndex--;
                        dropdown?.children[highlightedIndex].scrollIntoView({
                            block: 'nearest',
                            behavior: 'smooth',
                        });
                    }
                "
            />
            <button @click="handleChevronBtnClick" name="options-open-btn">
                <ChevronUpDownIcon
                    class="absolute right-2 top-2 h-5 w-5 text-zinc-400 hover:cursor-pointer"
                />
            </button>
        </div>

        <div
            ref="dropdown"
            v-show="showDropdown || query.trim().length > 0"
            class="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border-[1px] border-zinc-100 bg-white shadow-md"
            data-test="options"
        >
            <li
                name="list-item"
                v-for="option in filtered"
                :key="option.id"
                :disabled="option.selected"
                class="w-full list-none text-sm hover:bg-zinc-100"
                :class="[
                    'relative cursor-default select-none py-2 pl-3 pr-9',
                    {
                        'bg-white text-black hover:bg-zinc-100': !option.selected,
                        'text-zinc-300 hover:bg-white': option.selected,
                        'bg-zinc-100': highlightedIndex === filtered.indexOf(option),
                    },
                ]"
                @click="
                    () => {
                        if (!option.selected) {
                            selectedOptions.push(option.value);
                        }
                        query = '';
                        showDropdown = false;
                    }
                "
            >
                <span class="block truncate" data-test="group-selector">
                    {{ option.label }}
                </span>
            </li>
        </div>
        <div class="mt-3 flex flex-wrap gap-3">
            <LTag
                v-for="option in selectedLabels"
                :key="option.id"
                @remove="
                    () => {
                        if (option.isRemovable !== false) {
                            selectedOptions.splice(selectedOptions?.indexOf(option.value), 1);
                        }
                    }
                "
                :disabled="disabled || option.isRemovable === false"
            >
                {{ option.label }}
            </LTag>
        </div>
    </div>
</template>
