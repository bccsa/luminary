<script lang="ts">
export default {
    inheritAttrs: false,
};
</script>

<script setup lang="ts">
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import {
    computed,
    nextTick,
    ref,
    watch,
    type Component,
    type StyleValue,
} from "vue";
import { onClickOutside, useElementBounding, useWindowSize } from "@vueuse/core";
import FormLabel from "./FormLabel.vue";
import FormMessage from "./FormMessage.vue";
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
    error:
        "border-red-300 bg-red-50 text-red-900 focus-within:outline-none focus-within:outline focus-within:outline-offset-[-3px] focus-within:outline-red-500 focus-within:ring-0",
};

const sizeHeights = {
    sm: "min-h-[32px] py-1.5 text-sm",
    base: "min-h-[38px] py-2 text-sm",
    lg: "min-h-[42px] py-2.5 text-base",
};

const id = `l-select-${useId()}`;
const listboxId = `${id}-listbox`;

const { attrsWithoutStyles } = useAttrsWithoutStyles();

const showDropdown = ref(false);
const triggerRef = ref<HTMLElement>();
const dropdown = ref<HTMLElement>();
const selectRoot = ref<HTMLElement>();
const highlightedIndex = ref(-1);

const { top, left, bottom, width } = useElementBounding(triggerRef);
const { height: windowHeight } = useWindowSize();

onClickOutside(
    selectRoot,
    () => {
        showDropdown.value = false;
    },
    { ignore: [dropdown] },
);

const selectedOption = computed(() =>
    props.options.find((o) => o.value === model.value),
);

const displayText = computed(() => {
    if (selectedOption.value) return selectedOption.value.label;
    return props.placeholder;
});

const isPlaceholderShown = computed(
    () => !selectedOption.value && Boolean(props.placeholder),
);

const positionData = computed(() => {
    if (!showDropdown.value) return undefined;

    const spaceBelow = windowHeight.value - bottom.value;
    const spaceAbove = top.value;

    const flip = spaceBelow < 200 && spaceAbove > 200 && spaceAbove > spaceBelow;

    return { flip };
});

const dropdownStyle = computed(() => {
    if (!positionData.value) return {};
    const { flip } = positionData.value;

    const styleTop = flip ? top.value : bottom.value;
    const styleLeft = left.value;

    return {
        top: `${styleTop}px`,
        left: `${styleLeft}px`,
        width: `${width.value}px`,
        position: "fixed" as const,
        zIndex: 9999,
    };
});

const placementClass = computed(() => {
    if (!positionData.value) return "";
    return positionData.value.flip ? "-translate-y-full mt-[-2px]" : "mt-1";
});

const enabledIndices = computed(() =>
    props.options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0),
);

function syncHighlightToValue() {
    const idx = props.options.findIndex((o) => o.value === model.value);
    if (idx >= 0 && !props.options[idx]!.disabled) {
        highlightedIndex.value = idx;
        return;
    }
    highlightedIndex.value = enabledIndices.value[0] ?? -1;
}

function toggle() {
    if (props.disabled) return;
    showDropdown.value = !showDropdown.value;
    if (showDropdown.value) {
        nextTick(() => {
            syncHighlightToValue();
        });
    }
}

function open() {
    if (props.disabled) return;
    if (!showDropdown.value) {
        showDropdown.value = true;
        nextTick(() => {
            syncHighlightToValue();
        });
    }
}

function selectOption(option: Option) {
    if (option.disabled) return;
    model.value = option.value;
    showDropdown.value = false;
    highlightedIndex.value = -1;
}

watch(showDropdown, (openState) => {
    if (!openState) {
        highlightedIndex.value = -1;
    }
});

function moveHighlight(delta: number) {
    const enabled = enabledIndices.value;
    if (enabled.length === 0) return;

    let pos = enabled.indexOf(highlightedIndex.value);
    if (pos < 0) pos = 0;
    else {
        pos = (pos + delta + enabled.length) % enabled.length;
    }
    highlightedIndex.value = enabled[pos]!;
    nextTick(() => {
        const el = dropdown.value?.children[highlightedIndex.value];
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
}

function onTriggerKeydown(e: KeyboardEvent) {
    if (props.disabled) return;
    if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!showDropdown.value) open();
        else moveHighlight(1);
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!showDropdown.value) open();
        else moveHighlight(-1);
    } else if (e.key === "Escape" && showDropdown.value) {
        e.preventDefault();
        showDropdown.value = false;
    } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (showDropdown.value) {
            const opt = props.options[highlightedIndex.value];
            if (opt && !opt.disabled) selectOption(opt);
        } else {
            open();
        }
    }
}

function onListKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
        e.preventDefault();
        moveHighlight(1);
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveHighlight(-1);
    } else if (e.key === "Enter") {
        e.preventDefault();
        const opt = props.options[highlightedIndex.value];
        if (opt && !opt.disabled) selectOption(opt);
    } else if (e.key === "Escape") {
        e.preventDefault();
        showDropdown.value = false;
    }
}

function listOptionClass(option: Option, index: number): string {
    if (option.disabled) {
        return "cursor-not-allowed text-zinc-400";
    }
    const selected = model.value === option.value;
    const highlighted = highlightedIndex.value === index;
    if (highlighted) {
        return selected
            ? "bg-zinc-100 font-medium text-zinc-900"
            : "bg-zinc-100 text-black";
    }
    if (selected) {
        return "bg-zinc-50 font-medium text-zinc-900 hover:bg-zinc-100";
    }
    return "bg-white text-black hover:bg-zinc-100";
}
</script>

<template>
    <div
        ref="selectRoot"
        class="relative"
        :class="$attrs['class']"
        :style="$attrs['style'] as StyleValue"
    >
        <div v-if="label" class="mb-2 flex justify-between">
            <div class="flex items-center gap-1">
                <FormLabel :for="id" :required="required">{{ label }}</FormLabel>
            </div>
        </div>
        <div class="relative">
            <div
                :id="id"
                ref="triggerRef"
                data-test="l-select-trigger"
                role="combobox"
                :aria-expanded="showDropdown"
                :aria-controls="listboxId"
                :aria-haspopup="true"
                :aria-required="required"
                tabindex="0"
                class="relative flex cursor-default justify-between gap-2 rounded-md border-[1px] focus:outline-none"
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
                @click="toggle"
                @keydown="onTriggerKeydown"
            >
                <div class="flex min-w-0 flex-1 items-center justify-center gap-2">
                    <div v-if="icon" class="flex shrink-0 items-center">
                        <component
                            :is="icon"
                            :class="{
                                'text-zinc-400': state == 'default' && !disabled,
                                'text-zinc-300': state == 'default' && disabled,
                                'text-red-400': state == 'error',
                            }"
                            class="h-5 w-5"
                        />
                    </div>
                    <span class="z-0 min-w-0 flex-1 truncate text-left">
                        {{ displayText }}
                    </span>
                    <button
                        class="fs-0 absolute inset-y-0 right-0 z-10 flex cursor-default items-center px-2 focus:outline-none"
                        type="button"
                        tabindex="-1"
                        :disabled="disabled"
                        aria-hidden="true"
                        @click.stop="toggle"
                    >
                        <ChevronUpDownIcon class="h-5 w-5 text-zinc-400 hover:cursor-pointer" />
                    </button>
                </div>
            </div>
        </div>
        <Teleport to="body">
            <div
                v-if="showDropdown"
                :id="listboxId"
                ref="dropdown"
                role="listbox"
                :style="dropdownStyle"
                class="overflow-y-auto rounded-md bg-white shadow-md focus:outline-none"
                :class="[placementClass, 'max-h-48']"
                data-test="l-select-listbox"
                tabindex="-1"
                @keydown="onListKeydown"
                @wheel.stop
                @touchmove.stop
                @pointerdown.stop.prevent
                @mousedown.stop.prevent
            >
                <li
                    v-for="(option, index) in options"
                    :key="index"
                    role="option"
                    :aria-selected="model === option.value"
                    :aria-disabled="option.disabled === true"
                    name="list-item"
                    :class="[
                        'relative w-full cursor-default select-none list-none py-2 pl-3 pr-9 text-start text-sm',
                        listOptionClass(option, index),
                    ]"
                    @click="selectOption(option)"
                >
                    <span class="block truncate" :title="option.label">
                        {{ option.label }}
                    </span>
                </li>
            </div>
        </Teleport>
        <FormMessage v-if="$slots.default" :state="state" :id="`${id}-message`">
            <slot />
        </FormMessage>
    </div>
</template>
