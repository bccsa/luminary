<script lang="ts">
export default {
    inheritAttrs: false,
};
</script>

<script setup lang="ts">
import { type Component, type StyleValue } from "vue";
import { useId } from "@/hooks/use-id";
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import { ExclamationCircleIcon } from "@heroicons/vue/20/solid";
import FormLabel from "./FormLabel.vue";
import FormMessage from "./FormMessage.vue";

type Props = {
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

const model = defineModel();

const states = {
    default:
        "text-gray-900 ring-gray-300 placeholder:text-gray-400 hover:ring-gray-400 focus:ring-gray-950",
    error: "text-red-900 bg-red-50 ring-red-300 placeholder:text-red-300 hover:ring-red-400 focus:ring-red-500",
};

const addOnStates = {
    default: "border-gray-300 px-3 text-gray-500",
    error: "border-red-300 bg-red-50 px-3 text-red-600",
};

const sizes = {
    sm: "py-1",
    base: "py-1.5",
    lg: "py-2.5",
};

const id = `ac-input-${useId()}`;
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
                        'text-gray-400': state == 'default' && !disabled,
                        'text-gray-300': state == 'default' && disabled,
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
            <input
                v-model="model"
                class="block w-full border-0 ring-1 ring-inset focus:ring-2 focus:ring-inset disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:ring-gray-200 sm:text-sm sm:leading-6"
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
                :disabled="disabled"
                :required="required"
                :placeholder="placeholder"
                v-bind="attrsWithoutStyles"
                :aria-describedby="$slots.default ? `${id}-message` : undefined"
            />
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
        <FormMessage v-if="$slots.default" :state="state" :id="`${id}-message`">
            <slot />
        </FormMessage>
    </div>
</template>
