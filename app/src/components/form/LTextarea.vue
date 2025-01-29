<script lang="ts">
export default {
    inheritAttrs: false,
};
</script>

<script setup lang="ts">
import { type Component, type StyleValue } from "vue";
import { useId } from "@/util/useId";
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import { ExclamationCircleIcon } from "@heroicons/vue/20/solid";
import FormLabel from "./FormLabel.vue";

type Props = {
    modelValue?: string;
    state?: keyof typeof states;
    size?: keyof typeof sizes;
    label?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    icon?: Component | Function;
    leftAddOn?: string;
    rightAddOn?: string;
};

withDefaults(defineProps<Props>(), {
    state: "default",
    size: "base",
    required: false,
    disabled: false,
});

const states = {
    default:
        "text-zinc-900 ring-zinc-300 placeholder:text-zinc-400 hover:ring-zinc-400 focus:ring-zinc-950",
    error: "text-red-900 ring-red-300 placeholder:text-red-300 hover:ring-red-400 focus:ring-red-500",
};

const addOnStates = {
    default: "border-zinc-300 px-3 text-zinc-500",
    error: "border-red-300 px-3 text-red-600",
};

const sizes = {
    sm: "py-1",
    base: "py-1.5",
    lg: "py-2.5",
};

const emit = defineEmits(["update:modelValue"]);

const id = `l-input-${useId()}`;
const { attrsWithoutStyles } = useAttrsWithoutStyles();
</script>

<template>
    <div :class="$attrs['class']" :style="$attrs['style'] as StyleValue">
        <FormLabel v-if="label" :for="id" :required="required">
            {{ label }}
        </FormLabel>
        <div class="relative mt-2 flex rounded-md shadow-sm">
            <div
                v-if="icon"
                class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
            >
                <component
                    :is="icon"
                    class="h-5 w-5"
                    :class="{
                        'text-zinc-400': state == 'default' && !disabled,
                        'text-zinc-300': state == 'default' && disabled,
                        'text-red-400': state == 'error',
                    }"
                />
            </div>
            <span
                v-if="leftAddOn"
                class="inline-flex items-center rounded-l-md border border-r-0 px-3 sm:text-sm"
                :class="[addOnStates[state]]"
            >
                {{ leftAddOn }}
            </span>
            <textarea
                class="block w-full border-0 px-2 ring-1 ring-inset focus:ring-2 focus:ring-inset disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 disabled:ring-zinc-200 sm:text-sm sm:leading-6"
                :class="[
                    sizes[size],
                    states[state],
                    {
                        'rounded-l-md': !leftAddOn,
                        'rounded-r-md': !rightAddOn,
                        'pl-10': icon,
                        'pr-10': state == 'error',
                    },
                ]"
                :id="id"
                :value="modelValue"
                :disabled="disabled"
                :required="required"
                :placeholder="placeholder"
                @input="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
                v-bind="attrsWithoutStyles"
                :aria-describedby="$slots.default ? `${id}-message` : undefined"
            ></textarea>
            <span
                v-if="rightAddOn"
                class="inline-flex items-center rounded-r-md border border-l-0 px-3 sm:text-sm"
                :class="[addOnStates[state]]"
            >
                {{ rightAddOn }}
            </span>
            <div
                v-if="state == 'error' && !rightAddOn"
                class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3"
            >
                <ExclamationCircleIcon class="h-5 w-5 text-red-500" aria-hidden="true" />
            </div>
        </div>
        <p
            v-if="$slots.default"
            class="mt-2 text-sm"
            :class="{ 'text-zinc-600': state == 'default', 'text-red-600': state == 'error' }"
            :id="`${id}-message`"
        >
            <slot />
        </p>
    </div>
</template>
