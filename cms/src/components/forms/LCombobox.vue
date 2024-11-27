<script setup lang="ts">
import { computed, ref, type StyleValue } from "vue";
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
};

type Props = {
    label?: string;
    disabled?: boolean;
    options: ComboboxOption[];
};

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
});
const selectedOptions = defineModel<Array<string | number>>("selectedOptions");

const inputElement = ref();
const comboboxElement = ref();
const dropdown = ref();
const showDropdown = ref(false);

const optionsList = computed(() =>
    props.options.map((o) => ({
        id: o.id,
        label: o.label,
        value: o.value,
        selected: selectedOptions.value?.includes(o.id),
    })),
);

const query = ref("");
const filtered = computed(() =>
    optionsList.value.filter((o) => o.label.toLowerCase().includes(query.value.toLowerCase())),
);

const handleChevronBtnClick = () => {
    inputElement.value.focus();
    showDropdown.value = !showDropdown.value;
};

onClickOutside(comboboxElement, () => (showDropdown.value = false));
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
                class="list-none text-sm hover:bg-zinc-100"
                :class="[
                    'relative cursor-default select-none py-2 pl-3 pr-9',
                    {
                        'bg-white text-black hover:bg-zinc-100': !option.selected,
                    },
                    {
                        'text-zinc-300 hover:bg-white': option.selected,
                    },
                ]"
                @click="
                    () => {
                        if (!option.selected) {
                            selectedOptions?.push(option.id);
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
                v-for="option in optionsList.filter((o) => o.selected)"
                :key="option.id"
                @remove="() => selectedOptions?.splice(selectedOptions?.indexOf(option.id), 1)"
                :disabled="disabled"
            >
                {{ option.label }}
            </LTag>
        </div>
    </div>
</template>
