<script lang="ts">
export default {
    inheritAttrs: false,
};
</script>

<script setup lang="ts">
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import { computed, ref, type Component, type StyleValue } from "vue";
import FormLabel from "./FormLabel.vue";
import FormMessage from "./FormMessage.vue";
import LDropdown from "@/components/common/LDropdown.vue";
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import { useId } from "@/util/useId";

type Option = { label: string; value: string | number; disabled?: boolean };

type Props = {
    options: Option[];
    state?: keyof typeof states;
    size?: "sm" | "base" | "lg";
    disabled?: boolean;
    label?: string;
    required?: boolean;
    icon?: Component | Function;
    placeholder?: string;
};

const props = withDefaults(defineProps<Props>(), {
    state: "default",
    size: "base",
    disabled: false,
    required: false,
    placeholder: "",
});

const model = defineModel<string | number | undefined>();

const states = {
    default:
        "border-zinc-300 bg-white focus-within:outline-none focus-within:outline focus-within:outline-offset-[-3px] focus-within:outline-zinc-500 focus-within:ring-0",
    error: "border-red-300 bg-red-50 text-red-900 focus-within:outline-none focus-within:outline focus-within:outline-offset-[-3px] focus-within:outline-red-500 focus-within:ring-0",
};

const sizeHeights = {
    sm: "min-h-[32px] py-1.5 text-sm",
    base: "min-h-[38px] py-2 text-sm",
    lg: "min-h-[42px] py-2.5 text-base",
};

const id = `l-select-${useId()}`;
const { attrsWithoutStyles } = useAttrsWithoutStyles();
const showDropdown = ref(false);

const selectedOption = computed(() => props.options.find((o) => o.value === model.value));

const displayText = computed(() => {
    if (selectedOption.value) return selectedOption.value.label;
    return props.placeholder;
});

const isPlaceholderShown = computed(() => !selectedOption.value && Boolean(props.placeholder));

function selectOption(option: Option) {
    if (option.disabled) return;
    model.value = option.value;
    showDropdown.value = false;
}

function listOptionClass(option: Option): string {
    if (option.disabled) {
        return "cursor-not-allowed text-zinc-400";
    }
    const selected = model.value === option.value;
    if (selected) {
        return "bg-zinc-50 font-medium text-zinc-900 hover:bg-zinc-100 focus:bg-zinc-100";
    }
    return "bg-white text-black hover:bg-zinc-100 focus:bg-zinc-100";
}
</script>

<template>
    <div class="relative" :class="$attrs['class']" :style="$attrs['style'] as StyleValue">
        <div v-if="label" class="mb-2 flex justify-between">
            <div class="flex items-center gap-1">
                <FormLabel :for="id" :required="required">{{ label }}</FormLabel>
            </div>
        </div>
        <LDropdown
            v-model:show="showDropdown"
            placement="bottom-start"
            width="full"
            padding="none"
            class="w-full"
        >
            <template #trigger>
                <div
                    :id="id"
                    data-test="l-select-trigger"
                    role="combobox"
                    :aria-expanded="showDropdown"
                    :aria-haspopup="true"
                    :aria-required="required"
                    class="relative flex w-full cursor-pointer justify-between gap-2 rounded-md border-[1px] hover:bg-zinc-50 focus:outline-none"
                    :class="[
                        states[state],
                        sizeHeights[size],
                        'pl-3 pr-8',
                        {
                            'cursor-not-allowed bg-zinc-100 text-zinc-500': disabled,
                            'text-zinc-900': !isPlaceholderShown && !disabled,
                            'text-zinc-400': isPlaceholderShown && !disabled,
                        },
                    ]"
                    v-bind="attrsWithoutStyles"
                >
                    <div class="flex min-w-0 flex-1 items-center gap-2">
                        <div v-if="icon" class="flex shrink-0 items-center">
                            <component
                                :is="icon"
                                :class="{
                                    'text-zinc-400': state === 'default' && !disabled,
                                    'text-zinc-300': state === 'default' && disabled,
                                    'text-red-400': state === 'error',
                                }"
                                class="h-5 w-5"
                            />
                        </div>
                        <!--
                            Ghost labels reserve the widest option's width via grid stacking,
                            so the trigger width does not jump when the selection changes.
                        -->
                        <div class="z-0 grid min-w-0 flex-1 text-left">
                            <span
                                v-for="option in options"
                                :key="`ghost-${option.value}`"
                                class="invisible col-start-1 row-start-1 truncate"
                                aria-hidden="true"
                            >
                                {{ option.label }}
                            </span>
                            <span
                                v-if="placeholder"
                                class="invisible col-start-1 row-start-1 truncate"
                                aria-hidden="true"
                            >
                                {{ placeholder }}
                            </span>
                            <span class="col-start-1 row-start-1 truncate">
                                {{ displayText }}
                            </span>
                        </div>
                        <span
                            class="absolute inset-y-0 right-0 z-10 flex items-center px-2"
                            aria-hidden="true"
                        >
                            <ChevronUpDownIcon class="h-5 w-5 text-zinc-400" />
                        </span>
                    </div>
                </div>
            </template>
            <ul class="w-full" data-test="l-select-listbox">
                <li
                    v-for="(option, index) in options"
                    :key="index"
                    role="menuitem"
                    tabindex="-1"
                    :aria-selected="model === option.value"
                    :aria-disabled="option.disabled === true"
                    name="list-item"
                    :class="[
                        'relative w-full cursor-pointer select-none list-none py-2 pl-3 pr-9 text-start text-sm outline-none',
                        listOptionClass(option),
                    ]"
                    @click="selectOption(option)"
                    @keydown.enter.prevent="selectOption(option)"
                    @keydown.space.prevent="selectOption(option)"
                >
                    <span class="block truncate" :title="option.label">
                        {{ option.label }}
                    </span>
                </li>
            </ul>
        </LDropdown>
        <FormMessage v-if="$slots.default" :state="state" :id="`${id}-message`">
            <slot />
        </FormMessage>
    </div>
</template>
