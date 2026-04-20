<script setup lang="ts">
import {
    computed,
    nextTick,
    onMounted,
    onUnmounted,
    ref,
    watch,
    type Component,
    type StyleValue,
} from "vue";
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import LTag from "../content/LTag.vue";
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import FormLabel from "@/components/forms/FormLabel.vue";
import LBadge, { type variants } from "../common/LBadge.vue";
import { breakpointsTailwind, useBreakpoints } from "@vueuse/core";
import LDialog from "../common/LDialog.vue";
import { isSmallScreen } from "@/globalConfig";
import LDropdown from "../common/LDropdown.vue";

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
    smallInput?: boolean;
    inlineTags?: boolean;
    noBorder?: boolean;
    placeholder?: string;
};

const props = withDefaults(defineProps<Props>(), {
    noBorder: false,
    disabled: false,
    showSelectedInDropdown: true,
    showSelectedLabels: true,
    showIcon: true,
});

const emit = defineEmits(["select"]);

const selectedOptions = defineModel<Array<string | number>>("selectedOptions", { required: true });
const showEditModal = defineModel<boolean>("showEditModal", { default: false });

const breakpoints = useBreakpoints(breakpointsTailwind);
const isMobileScreen = breakpoints.smaller("sm");

// Reference to the combobox input element and parent wrapper
const inputElement = ref<HTMLInputElement>();
const comboboxParent = ref<HTMLElement>();
const showDropdown = ref(false);

const selectedSet = computed(() => new Set(selectedOptions.value));
const optionsList = computed(() =>
    props.options.map((o) => ({
        ...o,
        selected: selectedSet.value.has(o.value),
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

const highlightedIndex = ref(-1);

watch(showDropdown, (val) => {
    if (val) {
        nextTick(() => inputElement.value?.focus());
    } else {
        highlightedIndex.value = -1;
    }
});

watch(query, (newVal) => {
    if (newVal.trim().length > 0) {
        showDropdown.value = true;
    }
});

const selectedLabels = computed(() => {
    if (props.selectedLabels) return props.selectedLabels;
    return optionsList.value.filter((o) => selectedOptions.value?.includes(o.id));
});

const open = () => {
    if (!showDropdown.value) {
        showDropdown.value = true;
    }
    nextTick(() => {
        inputElement.value?.focus();
    });
};

const selectOption = (option: any) => {
    if (!option.selected) {
        selectedOptions.value.push(option.value);
        emit("select", option);
    }
    query.value = "";
    showDropdown.value = false;
    highlightedIndex.value = -1;
};

watch(showEditModal, (newVal) => {
    if (newVal) {
        nextTick(() => {
            inputElement.value?.focus();
        });
    } else {
        query.value = "";
        showDropdown.value = false;
    }
});

const handleGlobalEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape" && showEditModal.value) {
        showEditModal.value = false;
    }
};

onMounted(() => {
    window.addEventListener("keydown", handleGlobalEscape);
});

onUnmounted(() => {
    window.removeEventListener("keydown", handleGlobalEscape);
});

defineExpose({ open, inputElement });

const onInlineBackspace = () => {
    if (query.value === "" && selectedOptions.value.length > 0) {
        const last = selectedOptions.value[selectedOptions.value.length - 1];
        const option = selectedLabels.value.find((o) => o.value === last);
        if (!option || option.isRemovable !== false) {
            selectedOptions.value.splice(selectedOptions.value.length - 1, 1);
        }
    }
};
</script>

<template>
    <div
        ref="comboboxParent"
        class="relative"
        :class="$attrs['class']"
        :style="$attrs['style'] as StyleValue"
        @click="() => inputElement?.focus()"
    >
        <div
            v-if="label || $slots.actions || (props.labelIcon && props.showIcon)"
            class="mb-2 flex justify-between"
        >
            <div class="flex items-center gap-1">
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
            class="relative"
            primaryButtonText="Close"
            title="Edit Selection"
            v-model:open="showEditModal"
            :heading="label"
            :showClosingButton="false"
        >
            <LDropdown
                v-model:show="showDropdown"
                placement="bottom-start"
                width="full"
                padding="none"
                class="w-full"
            >
                <template #trigger>
                    <!-- Inline tags trigger -->
                    <div
                        v-if="inlineTags"
                        class="relative flex min-h-[42px] flex-wrap items-center gap-1 rounded-md bg-white pl-2 pr-1 focus-within:outline focus-within:outline-offset-[-2px] focus-within:outline-zinc-950"
                        :class="{ 'border-[1px] border-zinc-300': !noBorder }"
                        v-bind="attrsWithoutStyles"
                    >
                        <LTag
                            v-for="option in selectedLabels"
                            :key="option.id"
                            @remove="
                                () => {
                                    if (option.isRemovable !== false) {
                                        selectedOptions.splice(
                                            selectedOptions.indexOf(option.value),
                                            1,
                                        );
                                    }
                                }
                            "
                            :disabled="disabled || option.isRemovable === false"
                        >
                            {{ option.label }}
                        </LTag>
                        <input
                            v-model="query"
                            ref="inputElement"
                            class="z-0 h-7 min-w-[40px] flex-1 border-0 bg-transparent p-0 text-zinc-900 placeholder:text-sm placeholder:text-zinc-400 focus:ring-0 sm:min-w-[80px]"
                            :placeholder="
                                selectedOptions.length > 0 && !query
                                    ? ''
                                    : (placeholder ?? 'Type to select...')
                            "
                            name="option-search"
                            autocomplete="off"
                            @keydown.backspace="onInlineBackspace"
                            @keydown.enter="
                                () => {
                                    if (showDropdown) {
                                        if (highlightedIndex > -1) {
                                            selectOption(filtered[highlightedIndex]);
                                            return;
                                        }
                                        if (filtered.length > 0) {
                                            selectOption(filtered[0]);
                                        }
                                    }
                                }
                            "
                            @keydown.escape.prevent.stop="
                                () => {
                                    query = '';
                                    showDropdown = false;
                                }
                            "
                            @keydown.down="
                                () => {
                                    if (!showDropdown) showDropdown = true;
                                    if (highlightedIndex < filtered.length - 1) highlightedIndex++;
                                }
                            "
                            @keydown.up="
                                () => {
                                    if (highlightedIndex > 0) highlightedIndex--;
                                }
                            "
                        />
                        <button
                            class="fs-0 absolute inset-y-0 right-0 z-10 flex cursor-default items-center px-2 focus:outline-none"
                            name="options-open-btn"
                            type="button"
                            tabindex="-1"
                        >
                            <ChevronUpDownIcon
                                class="h-5 w-5 text-zinc-400 hover:cursor-pointer"
                            />
                        </button>
                    </div>

                    <!-- Standard trigger -->
                    <div
                        v-else
                        class="relative flex w-full justify-between gap-2 rounded-md bg-white focus-within:outline focus-within:outline-offset-[-2px] focus-within:outline-zinc-950"
                        :class="{
                            'border-[1px] border-zinc-300': !noBorder,
                            'pl-1 pr-3': smallInput && isMobileScreen,
                            'pl-3 pr-3': !smallInput || !isMobileScreen,
                        }"
                        tabindex="0"
                        v-bind="attrsWithoutStyles"
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
                                v-model="query"
                                ref="inputElement"
                                class="z-0 w-full flex-1 border-0 bg-transparent p-0 text-zinc-900 ring-zinc-300 placeholder:text-sm placeholder:text-zinc-400 focus:ring-0"
                                :class="[
                                    smallInput && isMobileScreen
                                        ? 'h-[30px] text-sm'
                                        : 'h-[38px]',
                                    { 'w-96': $slots.actions && !isSmallScreen },
                                ]"
                                :placeholder="placeholder ?? 'Type to select...'"
                                name="option-search"
                                autocomplete="off"
                                @keydown.enter="
                                    () => {
                                        if (showDropdown) {
                                            if (highlightedIndex > -1) {
                                                selectOption(filtered[highlightedIndex]);
                                                return;
                                            }
                                            if (filtered.length > 0) {
                                                selectOption(filtered[0]);
                                            }
                                        }
                                    }
                                "
                                @keydown.escape.prevent.stop="
                                    () => {
                                        query = '';
                                        showDropdown = false;
                                    }
                                "
                                @keydown.down="
                                    () => {
                                        if (!showDropdown) showDropdown = true;
                                        if (highlightedIndex < filtered.length - 1)
                                            highlightedIndex++;
                                    }
                                "
                                @keydown.up="
                                    () => {
                                        if (highlightedIndex > 0) highlightedIndex--;
                                    }
                                "
                            />
                            <button
                                class="absolute right-2 flex items-center"
                                name="options-open-btn"
                            >
                                <ChevronUpDownIcon
                                    class="h-5 w-5 text-zinc-400 hover:cursor-pointer"
                                />
                            </button>
                        </div>
                    </div>
                </template>

                <div
                    class="max-h-48 w-full"
                    :class="{ 'w-96': $slots.actions && !isSmallScreen }"
                    data-test="options"
                    @wheel.stop
                    @touchmove.stop
                >
                    <li
                        name="list-item"
                        v-for="option in filtered"
                        :key="option.id"
                        :disabled="option.selected"
                        role="menuitem"
                        class="w-full cursor-pointer list-none text-start text-sm hover:bg-zinc-100 focus:bg-zinc-100"
                        :class="[
                            'relative cursor-default select-none py-2 pl-3 pr-9',
                            {
                                'bg-white text-black hover:bg-zinc-100': !option.selected,
                                'text-zinc-300 hover:bg-white': option.selected,
                                'bg-zinc-100': highlightedIndex === filtered.indexOf(option),
                            },
                        ]"
                        @click="selectOption(option)"
                    >
                        <span
                            class="block truncate"
                            data-test="group-selector"
                            :title="option.label"
                        >
                            {{ option.label }}
                        </span>
                    </li>
                </div>
            </LDropdown>
            <div
                data-test="selected-labels"
                v-if="showSelectedLabels && !inlineTags"
                class="flex w-full flex-wrap gap-1 pt-1"
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
                    data-test="selected-tag"
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

<style scoped>
input[name="option-search"] {
    -webkit-appearance: none;
    appearance: none;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
}
</style>
