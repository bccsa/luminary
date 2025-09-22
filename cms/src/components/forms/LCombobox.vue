<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component, type StyleValue } from "vue";
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import LTag from "../content/LTag.vue";
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import FormLabel from "@/components/forms/FormLabel.vue";
import { onClickOutside } from "@vueuse/core";
import LBadge, { type variants } from "../common/LBadge.vue";
import LDialog from "../common/LDialog.vue";
import { isSmallScreen } from "@/globalConfig";

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
    labelIcon?: any;
    disabled?: boolean;
    options: ComboboxOption[];
    showSelectedInDropdown?: boolean;
    selectedLabels?: ComboboxOption[];
    showSelectedLabels?: boolean;
    icon?: Component | Function;
    showIcon?: boolean;
    badgeVariant?: keyof typeof variants;
};

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
    showSelectedInDropdown: true,
    showSelectedLabels: true,
    showIcon: true,
});

const selectedOptions = defineModel<Array<string | number>>("selectedOptions", { required: true });
const showEditModal = defineModel<boolean>("showEditModal", { default: false });

const inputElement = ref<HTMLElement>();
const comboboxParent = ref<HTMLElement>();
const dropdown = ref<HTMLElement>();
const showDropdown = ref(false);

const optionsList = computed(() =>
    props.options.map((o) => ({
        ...o,
        selected: selectedOptions.value?.includes(o.value),
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

onClickOutside(comboboxParent, () => {
    showDropdown.value = false;
});

const highlightedIndex = ref(-1);

watch(showDropdown, () => {
    if (!showDropdown.value) {
        highlightedIndex.value = -1;
    }
});

const selectedLabels = computed(() => {
    if (props.selectedLabels) return props.selectedLabels;
    return optionsList.value.filter((o) => selectedOptions.value?.includes(o.id));
});

const toggleDropdown = () => {
    showDropdown.value = !showDropdown.value;
    nextTick(() => {
        inputElement.value?.focus();
    });
};
</script>

<template>
    <div
        ref="comboboxParent"
        class="relative"
        :class="$attrs['class']"
        :style="$attrs['style'] as StyleValue"
    >
        <div class="flex justify-between">
            <div class="mb-2 flex items-center gap-1">
                <component
                    :is="props.labelIcon"
                    class="h-5 w-5 text-zinc-400"
                    v-if="props.labelIcon && props.showIcon"
                />
                <FormLabel v-if="label">{{ label }}</FormLabel>
            </div>
            <slot name="actions" v-if="$slots.actions" />
        </div>
        <div
            v-if="$slots.actions && showSelectedLabels && selectedLabels.length > 0"
            class="mt-1 flex gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide sm:flex-wrap sm:overflow-visible sm:whitespace-normal"
        >
            <LBadge
                v-for="option in selectedLabels"
                :key="option.id"
                type="default"
                :variant="props.badgeVariant"
            >
                {{ option.label }}
            </LBadge>
        </div>

        <component
            :is="$slots.actions ? LDialog : 'div'"
            :primaryAction="() => (showEditModal = false)"
            primaryButtonText="Close"
            title="Edit Selection"
            v-model:open="showEditModal"
            :heading="label"
        >
            <div
                class="flex justify-between gap-2 rounded-md border-[1px] border-zinc-300 bg-white pl-3 pr-3 focus-within:outline focus-within:outline-offset-[-2px] focus-within:outline-zinc-950"
                tabindex="0"
                v-bind="attrsWithoutStyles"
                @click="showDropdown = !showDropdown"
            >
                <div class="flex items-center justify-center gap-2">
                    <div v-if="icon" class="flex items-center">
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
                        @click.stop="toggleDropdown"
                        v-model="query"
                        ref="inputElement"
                        class="z-0 h-[38px] flex-1 border-0 bg-transparent p-0 text-zinc-900 ring-zinc-300 placeholder:text-sm placeholder:text-zinc-400 focus:ring-0"
                        :class="{
                            'w-96': $slots.actions && !isSmallScreen,
                        }"
                        placeholder="Type to select..."
                        name="option-search"
                        autocomplete="off"
                        @keydown.enter="
                            () => {
                                if (showDropdown) {
                                    // Add the highlighted option to the selected options on enter
                                    if (highlightedIndex > -1) {
                                        selectedOptions.push(filtered[highlightedIndex].value);
                                        query = '';
                                        showDropdown = false;
                                        return;
                                    }
                                    // If no option is highlighted, add the first option to the selected options
                                    if (filtered.length > 0) {
                                        selectedOptions.push(filtered[0].id);
                                        query = '';
                                        showDropdown = false;
                                    }
                                }
                            }
                        "
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
                </div>
                <button @click.stop="toggleDropdown" name="options-open-btn">
                    <ChevronUpDownIcon class="h-5 w-5 text-zinc-400 hover:cursor-pointer" />
                </button>
            </div>

            <div
                ref="dropdown"
                v-if="showDropdown || query.trim().length > 0"
                class="absolute z-10 mt-1 max-h-48 w-11/12 overflow-y-auto rounded-md border-[1px] border-zinc-100 bg-white shadow-md"
                :class="{
                    'w-96': $slots.actions && !isSmallScreen,
                }"
                data-test="options"
                @wheel.stop
                @touchmove.stop
            >
                <li
                    name="list-item"
                    v-for="option in filtered"
                    :key="option.id"
                    :disabled="option.selected"
                    class="w-full list-none text-start text-sm hover:bg-zinc-100"
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
                    <span class="block truncate" data-test="group-selector" :title="option.label">
                        {{ option.label }}
                    </span>
                </li>
            </div>
            <div
                data-test="selected-labels"
                v-if="showSelectedLabels"
                class="mt-2 flex flex-wrap gap-3"
            >
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
            <div
                v-if="showSelectedLabels && selectedLabels.length === 0"
                class="pt-4 text-center text-xs italic text-zinc-500"
            >
                No options selected yet.
            </div>
        </component>
    </div>
</template>
