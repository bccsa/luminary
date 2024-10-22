<script setup lang="ts">
import { ref, watch, type Component, type StyleValue } from "vue";
import { ChevronDownIcon, XMarkIcon } from "@heroicons/vue/20/solid";
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import { onClickOutside } from "@vueuse/core";

type Option = { label: string; value: string; isChecked: boolean; disabled?: boolean };

type Props = {
    options: Option[];
    state?: "default" | "error";
    searchable?: boolean;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    icon?: Component | Function;
};

const props = withDefaults(defineProps<Props>(), {
    searchable: false,
    placeholder: "Select Options",
    disabled: false,
    required: false,
    state: "default",
});

const givenOptions = ref(props.options);
const selectedValues = defineModel<Option[]>("modelValue", { default: () => [] });

const toggleOption = (option: Option) => {
    const index = selectedValues.value.findIndex((v) => v.value === option.value);

    if (index > -1) {
        // Remove option if already selected
        selectedValues.value.splice(index, 1);
    } else {
        // Add option if not selected
        selectedValues.value.push(option);
    }

    props.options.forEach((opt) => {
        opt.isChecked = selectedValues.value.some((v) => v.value === opt.value);
    });
};

const isOptionSelected = (option: Option) => {
    return selectedValues.value.some((v) => v.value === option.value);
};

const query = ref("");

const showOptions = ref(false);

const optionsAsRef = ref(undefined);
onClickOutside(optionsAsRef, () => (showOptions.value = false));

watch(query, () => {
    givenOptions.value = props.options.filter((option) =>
        option.label.toLowerCase().includes(query.value.toLowerCase().trim()),
    );
});

const emit = defineEmits(["clear-selected-values"]);

const clearSelectedValues = () => {
    selectedValues.value = [];
    emit("clear-selected-values");
};

const { attrsWithoutStyles } = useAttrsWithoutStyles();
</script>

<template>
    <div :class="$attrs['class']" :style="$attrs['style'] as StyleValue">
        <div
            class="group relative h-full w-64 cursor-default rounded-md border-0 py-1.5 pl-10 pr-10 text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 hover:bg-zinc-50 focus:ring-2 focus:ring-zinc-950 sm:text-sm"
            @focus="showOptions = true"
            @blur="showOptions = false"
            tabindex="0"
            :disabled="state === 'error'"
            v-bind="attrsWithoutStyles"
        >
            <div
                class="h-full"
                @click="showOptions = true"
                :disabled="state === 'error'"
                data-test="main-div"
            >
                <div class="absolute inset-y-0 left-0 flex h-full items-center pl-3">
                    <component
                        v-if="props.icon"
                        :is="props.icon"
                        :class="{
                            'text-zinc-400': props.state === 'default' && !props.disabled,
                            'text-zinc-300': props.state === 'default' && props.disabled,
                            'text-red-400': props.state === 'error',
                        }"
                        class="h-5 w-5 bg-inherit sm:text-sm"
                    />
                </div>

                <input
                    v-if="searchable"
                    :placeholder="props.placeholder"
                    class="h-full w-full border-0 bg-inherit p-0 text-sm focus:ring-0 group-hover:bg-zinc-50"
                    v-model="query"
                    @input="
                        givenOptions = props.options.filter((option) =>
                            option.label.toLowerCase().includes(query.toLowerCase()),
                        )
                    "
                    tabindex="-8"
                    :disabled="props.state === 'error'"
                />

                <span v-if="!searchable" class="flex-1">{{ placeholder }}</span>
                <div class="absolute inset-y-0 right-0 flex items-center pr-3">
                    <XMarkIcon
                        @click="clearSelectedValues"
                        v-if="selectedValues.length > 0"
                        class="h-5 w-5 cursor-pointer text-zinc-700"
                        aria-hidden="true"
                    />
                    <ChevronDownIcon class="h-5 w-5 text-zinc-700" aria-hidden="true" />
                </div>
            </div>

            <transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-out"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
            >
                <div
                    ref="optionsAsRef"
                    :disabled="state === 'error'"
                    v-if="showOptions"
                    class="absolute left-0 z-10 mt-2 max-h-48 w-64 overflow-auto rounded-md bg-white px-1 py-2 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
                    data-test="options-div"
                >
                    <div
                        v-for="option in givenOptions"
                        :key="option.value"
                        @click.stop="toggleOption(option)"
                        class="flex cursor-default select-none items-center rounded-md px-2 py-1 hover:bg-zinc-100"
                    >
                        <input
                            type="checkbox"
                            :id="option.value"
                            :class="{
                                'text-zinc-900': props.state === 'default' && !props.disabled,
                                'text-zinc-300': props.state === 'default' && props.disabled,
                                'text-red-400': props.state === 'error',
                            }"
                            :checked="isOptionSelected(option)"
                            class="mr-1 rounded-lg"
                            readonly
                        />
                        <span class="block whitespace-pre-wrap">{{ option.label }}</span>
                    </div>
                </div>
            </transition>
        </div>
    </div>
</template>
