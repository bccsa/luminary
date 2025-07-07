<script setup lang="ts">
import { ref, computed, nextTick, watch, inject } from "vue";
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import LTag from "../content/LTag.vue";
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import type { ComboboxOption } from "./LCombobox.vue";

const props = defineProps<{
    disabled: boolean;
    icon?: any;
    options: ComboboxOption[];
    selectedOptions: (string | number)[];
    showSelectedInDropdown: boolean;
    showSelectedLabels: boolean;
    selectedLabels: ComboboxOption[];
    badgeVariant?: string;
    showIcon?: boolean;
}>();

const emit = defineEmits<{
    (e: "update:selectedOptions", value: (string | number)[]): void;
}>();

const { attrsWithoutStyles } = useAttrsWithoutStyles();

const inputElement = ref<HTMLElement>();
const comboboxParent = inject<HTMLElement | undefined>("comboboxParent", undefined);
const dropdown = ref<HTMLElement>();
const showDropdown = ref(false);
const query = ref("");
const highlightedIndex = ref(-1);

// Type with added `selected` for rendering logic only
type InternalOption = ComboboxOption & { selected: boolean };

const optionsList = computed<InternalOption[]>(() =>
    props.options.map((o) => ({
        ...o,
        selected: props.selectedOptions.includes(o.value),
    })),
);

const filtered = computed(() =>
    optionsList.value.filter((o) => {
        if (!props.showSelectedInDropdown && o.selected) return false;
        return o.label.toLowerCase().includes(query.value.toLowerCase());
    }),
);

watch(showDropdown, () => {
    if (!showDropdown.value) highlightedIndex.value = -1;
});

function toggleDropdown() {
    showDropdown.value = !showDropdown.value;
    nextTick(() => inputElement.value?.focus());
}

function handleSelect(option: InternalOption) {
    if (!option.selected) {
        emit("update:selectedOptions", [...props.selectedOptions, option.value]);
    }
    query.value = "";
    showDropdown.value = false;
}

function handleRemove(option: ComboboxOption) {
    if (option.isRemovable === false) return;
    emit(
        "update:selectedOptions",
        props.selectedOptions.filter((id) => id !== option.value),
    );
}
</script>

<template>
    <!-- Main combobox input area -->
    <div
        class="flex justify-between gap-2 rounded-md border border-zinc-300 bg-white pl-3 pr-3 focus-within:outline focus-within:outline-offset-[-2px] focus-within:outline-zinc-950"
        tabindex="0"
        v-bind="attrsWithoutStyles"
        @click="showDropdown = !showDropdown"
    >
        <div class="flex items-center justify-center gap-2">
            <div v-if="icon" class="flex items-center">
                <component
                    :is="icon"
                    :class="disabled ? 'text-zinc-300' : 'text-zinc-400'"
                    class="h-5 w-5"
                />
            </div>
            <input
                ref="inputElement"
                v-model="query"
                @click.stop="toggleDropdown"
                class="z-0 h-[38px] flex-1 border-0 bg-transparent p-0 text-zinc-900 placeholder:text-sm placeholder:text-zinc-400 focus:ring-0"
                placeholder="Type to select..."
                name="option-search"
                autocomplete="off"
                @keydown.enter="
                    () => {
                        if (filtered.length > 0) handleSelect(filtered[0]);
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
                        dropdown?.children[highlightedIndex]?.scrollIntoView({
                            block: 'nearest',
                            behavior: 'smooth',
                        });
                    }
                "
                @keydown.up="
                    () => {
                        if (highlightedIndex > 0) highlightedIndex--;
                        dropdown?.children[highlightedIndex]?.scrollIntoView({
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

    <!-- Dropdown list -->
    <div
        ref="dropdown"
        v-if="showDropdown || query.trim().length > 0"
        class="absolute z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-zinc-100 bg-white shadow-md"
        :style="{ width: comboboxParent?.offsetWidth + 'px' }"
        data-test="options"
    >
        <li
            v-for="option in filtered"
            :key="option.id"
            name="list-item"
            class="w-full select-none list-none py-2 pl-3 pr-9 text-sm"
            :class="[
                option.selected ? 'text-zinc-300' : 'text-black hover:bg-zinc-100',
                highlightedIndex === filtered.indexOf(option) ? 'bg-zinc-100' : '',
            ]"
            @click="handleSelect(option)"
        >
            <span class="block truncate" :title="option.label">{{ option.label }}</span>
        </li>
    </div>

    <!-- Empty state -->
    <div
        v-if="showSelectedLabels && selectedLabels.length === 0"
        class="mt-2 rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm italic text-zinc-500"
    >
        No options selected yet.
    </div>

    <!-- Selected tags -->
    <div
        v-else-if="showSelectedLabels"
        data-test="selected-labels"
        class="mt-3 flex flex-wrap gap-3"
    >
        <LTag
            v-for="option in selectedLabels"
            :key="option.id"
            @remove="() => handleRemove(option)"
            :disabled="disabled || option.isRemovable === false"
        >
            {{ option.label }}
        </LTag>
    </div>
</template>
