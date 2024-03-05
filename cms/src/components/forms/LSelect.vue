<script lang="ts">
export default {
    inheritAttrs: false,
};
</script>

<script setup lang="ts">
import { type StyleValue } from "vue";
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import { useId } from "@/util/useId";
import FormLabel from "./FormLabel.vue";
import FormMessage from "./FormMessage.vue";

type Option = { label: string; value: string; disabled?: boolean };

type Props = {
    options: Option[];
    state?: keyof typeof states;
    size?: "sm" | "base" | "lg";
    disabled?: boolean;
    label?: string;
    required?: boolean;
};

withDefaults(defineProps<Props>(), {
    state: "default",
    size: "base",
    disabled: false,
    required: false,
});

const model = defineModel();

const states = {
    default: "text-gray-900 ring-gray-300 focus:ring-gray-950",
    error: "text-red-900 bg-red-50 ring-red-300 focus:ring-red-500",
};

const id = `l-select-${useId()}`;

const { attrsWithoutStyles } = useAttrsWithoutStyles();
</script>

<template>
    <div :class="$attrs['class']" :style="$attrs['style'] as StyleValue">
        <FormLabel :for="id" class="block text-sm font-medium leading-6 text-gray-900">
            {{ label }}
        </FormLabel>
        <select
            v-model="model"
            class="mt-2 block w-full rounded-md border-0 py-1.5 pl-3 pr-10 ring-1 ring-inset focus:ring-2 disabled:bg-gray-100 disabled:text-gray-500 disabled:ring-gray-200 sm:text-sm sm:leading-6"
            :class="states[state]"
            :id="id"
            :disabled="disabled"
            :required="required"
            v-bind="attrsWithoutStyles"
        >
            <option
                v-for="(option, key) in options"
                :key="key"
                :value="option.value"
                :disabled="option.disabled"
            >
                {{ option.label }}
            </option>
        </select>
        <FormMessage v-if="$slots.default" :state="state" :id="`${id}-message`">
            <slot />
        </FormMessage>
    </div>
</template>
