<script lang="ts">
export default {
    inheritAttrs: false,
};
</script>

<script setup lang="ts">
import { type Component, type StyleValue } from "vue";
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import { useId } from "@/util/useId";
import FormLabel from "./FormLabel.vue";
import FormMessage from "./FormMessage.vue";

type Option = { label: string; value: string | number; disabled?: boolean };

type Props = {
    options: Option[];
    state?: keyof typeof states;
    size?: "sm" | "base" | "lg";
    disabled?: boolean;
    label?: string;
    required?: boolean;
    icon?: Component | Function;
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
        <FormLabel :for="id" class="mb-1.5 block text-sm font-medium leading-6 text-zinc-900">
            {{ label }}
        </FormLabel>
        <div class="relative">
            <div v-if="icon" class="absolute inset-y-0 left-0 flex items-center pl-3">
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
            <select
                v-model="model"
                class="block h-full w-full justify-items-center rounded-md border-0 text-sm font-semibold text-zinc-900 shadow-sm ring-1 ring-inset hover:bg-zinc-50 focus:ring-2 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:ring-zinc-200 sm:text-sm sm:leading-6"
                :class="[states[state], icon ? 'px-3 py-2 pl-10 pr-10' : '']"
                :id="id"
                :disabled="disabled"
                :required="required"
                v-bind="attrsWithoutStyles"
            >
                <option
                    class="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm text-zinc-700"
                    v-for="(option, key) in options"
                    :key="key"
                    :value="option.value"
                    :disabled="option.disabled"
                >
                    {{ option.label }}
                </option>
            </select>
        </div>
        <FormMessage v-if="$slots.default" :state="state" :id="`${id}-message`">
            <slot />
        </FormMessage>
    </div>
</template>
