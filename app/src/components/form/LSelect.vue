<script setup lang="ts">
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import { computed, ref, useId, type StyleValue } from "vue";
import DropdownMenu from "@/components/common/DropdownMenu.vue";

/** `style` lets an option preview itself, e.g. a font rendered in its own face. */
type Option = { label: string; value: string | number; disabled?: boolean; style?: StyleValue };

type Props = {
    options: Option[];
    size?: "sm" | "base" | "lg";
    disabled?: boolean;
    label?: string;
    placeholder?: string;
    placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
};

const props = withDefaults(defineProps<Props>(), {
    size: "base",
    disabled: false,
    placeholder: "",
    placement: "bottom-start",
});

const model = defineModel<string | number | undefined>();

const sizeHeights = {
    sm: "min-h-[34px] py-1.5 text-sm",
    base: "min-h-[40px] py-2 text-sm",
    lg: "min-h-[44px] py-2.5 text-base",
};

const id = `l-select-${useId()}`;
const showDropdown = ref(false);

const selectedOption = computed(() => props.options.find((o) => o.value === model.value));
const displayText = computed(() => selectedOption.value?.label ?? props.placeholder);
const isPlaceholderShown = computed(() => !selectedOption.value && Boolean(props.placeholder));

function selectOption(option: Option) {
    if (option.disabled) return;
    model.value = option.value;
    showDropdown.value = false;
}

function listOptionClass(option: Option): string {
    if (option.disabled) return "cursor-not-allowed text-zinc-400 dark:text-slate-500";
    if (model.value === option.value) {
        return "bg-yellow-500/15 font-medium text-zinc-900 hover:bg-yellow-500/25 dark:text-white";
    }
    return "text-zinc-800 hover:bg-zinc-100 focus:bg-zinc-100 dark:text-slate-100 dark:hover:bg-slate-600 dark:focus:bg-slate-600";
}
</script>

<template>
    <div>
        <label
            v-if="label"
            :for="id"
            class="mb-2 block text-sm font-medium text-zinc-900 dark:text-slate-100"
        >
            {{ label }}
        </label>
        <!-- The disabled state blocks the toggle rather than the trigger, which DropdownMenu owns. -->
        <DropdownMenu
            :open="showDropdown"
            :placement="placement"
            panel-class="w-full py-1"
            @update:open="(value: boolean) => (showDropdown = !disabled && value)"
        >
            <template #trigger>
                <div
                    :id="id"
                    data-test="l-select-trigger"
                    role="combobox"
                    :aria-expanded="showDropdown"
                    :aria-haspopup="true"
                    :aria-disabled="disabled"
                    class="relative flex w-full justify-between gap-2 rounded-md border border-zinc-300 bg-white pl-3 pr-8 hover:bg-zinc-50 dark:border-slate-500 dark:bg-slate-800 dark:hover:bg-slate-700"
                    :class="[
                        sizeHeights[size],
                        {
                            'cursor-not-allowed bg-zinc-100 text-zinc-500': disabled,
                            'text-zinc-900 dark:text-slate-100': !isPlaceholderShown && !disabled,
                            'text-zinc-400': isPlaceholderShown && !disabled,
                        },
                    ]"
                    :style="selectedOption?.style"
                >
                    <!-- Ghost labels reserve the widest option's width via grid stacking,
                         so the trigger width does not jump when the selection changes. -->
                    <div class="grid min-w-0 flex-1 text-left">
                        <span
                            v-for="option in options"
                            :key="`ghost-${option.value}`"
                            class="invisible col-start-1 row-start-1 truncate"
                            :style="option.style"
                            aria-hidden="true"
                        >
                            {{ option.label }}
                        </span>
                        <span
                            class="col-start-1 row-start-1 truncate"
                            data-test="l-select-value"
                        >
                            {{ displayText }}
                        </span>
                    </div>
                    <span
                        class="absolute inset-y-0 right-0 flex items-center px-2"
                        aria-hidden="true"
                    >
                        <ChevronUpDownIcon class="h-5 w-5 text-zinc-400" />
                    </span>
                </div>
            </template>
            <ul
                class="w-full"
                data-test="l-select-listbox"
            >
                <li
                    v-for="option in options"
                    :key="option.value"
                    role="menuitem"
                    tabindex="-1"
                    :aria-selected="model === option.value"
                    :aria-disabled="option.disabled === true"
                    name="list-item"
                    :class="[
                        'relative w-full cursor-pointer select-none list-none px-3 py-2 text-start text-sm outline-none',
                        listOptionClass(option),
                    ]"
                    :style="option.style"
                    @click="selectOption(option)"
                    @keydown.enter.prevent="selectOption(option)"
                    @keydown.space.prevent="selectOption(option)"
                >
                    <span
                        class="block truncate"
                        :title="option.label"
                    >
                        {{ option.label }}
                    </span>
                </li>
            </ul>
        </DropdownMenu>
    </div>
</template>
