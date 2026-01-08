<script lang="ts">
export default {
    inheritAttrs: false,
};
</script>

<script setup lang="ts">
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import { type StyleValue } from "vue";
import { useId } from "@/util/useId";
import { cva, type VariantProps } from "cva";
import { twMerge } from "tailwind-merge";
import FormLabel from "./FormLabel.vue";

const radioClasses = cva({
    base: "group inline-flex items-center justify-center gap-x-1.5 rounded-full text-sm font-semibold ring-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed",
    variants: {
        variant: {
            primary:
                "bg-white focus:ring-zinc-950 ring-1 shadow-sm text-zinc-900 ring-zinc-300 hover:bg-zinc-50 active:bg-zinc-100/70 disabled:bg-zinc-100 disabled:text-zinc-500",
        },
        size: {
            sm: "px-2 py-1.5",
            base: "px-3 py-2",
            lg: "px-3.5 py-2.5",
        },
        context: {
            default: "",
            danger: "",
        },
    },
    compoundVariants: [
        {
            variant: "primary",
            context: "danger",
            class: "bg-red-600 ring-red-700/60 hover:bg-red-600/80 active:text-white active:bg-red-600/70 disabled:bg-red-300 disabled:text-red-50 disabled:ring-red-300/90",
        },
    ],
});

type RadioProps = VariantProps<typeof radioClasses>;

type Props = {
    modelValue?: string;
    name?: string;
    value?: string;
    label?: string;
    variant?: RadioProps["variant"];
    size?: RadioProps["size"];
    context?: RadioProps["context"];
    disabled?: boolean;
};

withDefaults(defineProps<Props>(), {
    context: "default",
    variant: "primary",
    size: "base",
    disabled: false,
});

const id = `l-radio-${useId()}`;

const emit = defineEmits(["update:modelValue"]);

const { attrsWithoutStyles } = useAttrsWithoutStyles();
</script>

<template>
    <div
        class="flex items-center justify-stretch gap-2"
        :class="$attrs['class']"
        :style="$attrs['style'] as StyleValue"
    >
        <input
            type="radio"
            :name="name"
            :class="twMerge(radioClasses({ variant }))"
            :id="id"
            :disabled="disabled"
            :value="value"
            :checked="modelValue == value"
            @input="emit('update:modelValue', value)"
            v-bind="attrsWithoutStyles"
        />
        <FormLabel class="" :for="id" v-if="label">{{ label }}</FormLabel>
    </div>
</template>
