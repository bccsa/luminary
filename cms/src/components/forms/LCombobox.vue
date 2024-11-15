<script setup lang="ts">
import { computed, ref, watch, type StyleValue } from "vue";
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import LTag from "../content/LTag.vue";
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import FormLabel from "./FormLabel.vue";
import LInput from "./LInput.vue";
import { onClickOutside } from "@vueuse/core";

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

const optionsList = computed(() =>
    props.options.map((o) => ({
        id: o.id,
        label: o.label,
        value: o.value,
        selected: selectedOptions.value?.includes(o.id),
    })),
);
const optionsToDisplay = ref(optionsList.value);

const query = ref("");

watch(query, () => {
    const currentOptionsList = optionsList.value;
    if (query.value.length > 0) {
        showOptions.value = true;

        // Filter options based on query matching the label (case-insensitive)
        optionsToDisplay.value = currentOptionsList.filter((o) =>
            o.label.toLowerCase().includes(query.value.toLowerCase()),
        );
    } else {
        optionsToDisplay.value = currentOptionsList;
    }
});

const input = ref();

const optionsDisplay = ref();
const showOptions = ref(false);

const { attrsWithoutStyles } = useAttrsWithoutStyles();

const focusInput = () => {
    showOptions.value = !showOptions.value;
    input.value.focus();
};

onClickOutside(optionsDisplay, () => (showOptions.value = false));
</script>

<template>
    <div class="relative" :class="$attrs['class']" :style="$attrs['style'] as StyleValue">
        <FormLabel v-if="label"> {{ label }} </FormLabel>
        <div class="relative mt-2 flex w-full rounded-md" v-bind="attrsWithoutStyles">
            <LInput
                @click="showOptions = true"
                v-model="query"
                ref="input"
                class="w-full"
                placeholder="Type to select..."
                name="option-search"
            />
            <button name="options-open-btn" @click="focusInput">
                <ChevronUpDownIcon
                    class="absolute right-2 top-2 h-5 w-5 text-zinc-400 hover:cursor-pointer"
                />
            </button>
        </div>

        <div
            ref="optionsDisplay"
            v-show="showOptions"
            class="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border-[1px] border-zinc-100 bg-white shadow-md"
            data-test="options"
        >
            <ul>
                <li
                    v-for="option in optionsToDisplay"
                    :key="option.id"
                    :disabled="selectedOptions?.includes(option.id)"
                    class="text-sm hover:bg-zinc-100"
                    :class="[
                        'relative cursor-default select-none py-2 pl-3 pr-9',
                        {
                            'bg-white text-black hover:bg-zinc-100': !selectedOptions?.includes(
                                option.id,
                            ),
                        },
                        {
                            'text-zinc-500 hover:bg-white': selectedOptions?.includes(option.id),
                        },
                    ]"
                    @click="
                        () => {
                            if (!selectedOptions?.includes(option.id)) {
                                selectedOptions?.push(option.id);
                            }
                        }
                    "
                >
                    <span class="block truncate" data-test="group-selector">
                        {{ option.label }}
                    </span>
                </li>
            </ul>
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
        <div v-if="selectedOptions?.length == 0" class="text-xs text-zinc-500">
            No group selected
        </div>
    </div>
</template>
