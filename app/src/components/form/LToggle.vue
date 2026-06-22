<script setup lang="ts">
import { computed, toRefs } from "vue";

// App port of the CMS `LToggle`, rebuilt on a native <button role="switch"> instead of HeadlessUI's
// <Switch> (the app avoids HeadlessUI — it adds unit-testing overhead). Same `v-model` API, themed
// for the app (yellow accent + dark mode).

type Props = {
    modelValue: boolean;
    disabled?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
});

const { modelValue } = toRefs(props);

const emit = defineEmits(["update:modelValue"]);

const toggled = computed({
    get() {
        return !!modelValue.value;
    },
    set(value: boolean) {
        emit("update:modelValue", value);
    },
});

const toggle = () => {
    if (props.disabled) return;
    toggled.value = !toggled.value;
};
</script>

<template>
    <button
        type="button"
        role="switch"
        :aria-checked="toggled"
        :disabled="disabled"
        @click="toggle"
        :class="[
            'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800',
            {
                'cursor-pointer': !disabled,
                'bg-yellow-300 dark:bg-yellow-700': disabled && toggled,
                'bg-zinc-100 dark:bg-slate-600': disabled && !toggled,
                'bg-yellow-500': !disabled && toggled,
                'bg-zinc-200 dark:bg-slate-600': !disabled && !toggled,
            },
        ]"
    >
        <span class="sr-only">Toggle</span>
        <span
            :class="[
                toggled ? 'translate-x-4' : 'translate-x-0',
                'pointer-events-none relative inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
            ]"
        >
            <span
                :class="[
                    toggled
                        ? 'opacity-0 duration-100 ease-out'
                        : 'opacity-100 duration-200 ease-in',
                    'absolute inset-0 flex h-full w-full items-center justify-center transition-opacity',
                ]"
                aria-hidden="true"
            >
                <svg
                    fill="none"
                    viewBox="0 0 12 12"
                    :class="['h-3 w-3', disabled ? 'text-zinc-300' : 'text-zinc-400']"
                >
                    <path
                        d="M4 8l2-2m0 0l2-2M6 6L4 4m2 2l2 2"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </span>
            <span
                :class="[
                    toggled
                        ? 'opacity-100 duration-200 ease-in'
                        : 'opacity-0 duration-100 ease-out',
                    'absolute inset-0 flex h-full w-full items-center justify-center transition-opacity',
                ]"
                aria-hidden="true"
            >
                <svg class="h-2.5 w-2.5 text-yellow-600" fill="currentColor" viewBox="0 0 12 12">
                    <path
                        d="M3.707 5.293a1 1 0 00-1.414 1.414l1.414-1.414zM5 8l-.707.707a1 1 0 001.414 0L5 8zm4.707-3.293a1 1 0 00-1.414-1.414l1.414 1.414zm-7.414 2l2 2 1.414-1.414-2-2-1.414 1.414zm3.414 2l4-4-1.414-1.414-4 4 1.414 1.414z"
                    />
                </svg>
            </span>
        </span>
    </button>
</template>
