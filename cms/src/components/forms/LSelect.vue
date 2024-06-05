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
import LBadge from "../common/LBadge.vue";

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
    default: "text-zinc-900 ring-zinc-300 focus:ring-zinc-950",
    error: "text-red-900 bg-red-50 ring-red-300 focus:ring-red-500",
};

const id = `l-select-${useId()}`;

const { attrsWithoutStyles } = useAttrsWithoutStyles();
</script>

<template>
    <div :class="$attrs['class']" :style="$attrs['style'] as StyleValue">
        <FormLabel :for="id" class="block text-sm font-medium leading-6 text-zinc-900">
            {{ label }}
        </FormLabel>
        <select
            v-model="model"
            class="block w-full justify-items-center rounded-md border-0 px-3 py-2 pr-10 text-sm font-semibold text-zinc-900 shadow-sm ring-1 ring-inset hover:bg-zinc-50 focus:ring-2 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:ring-zinc-200 sm:text-sm sm:leading-6"
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
                class="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm text-zinc-700"
            >
                {{ option.label }}
            </option>
        </select>
        <FormMessage v-if="$slots.default" :state="state" :id="`${id}-message`">
            <slot />
        </FormMessage>
    </div>
</template>
