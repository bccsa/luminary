<script setup lang="ts">
import { computed, useId } from "vue";

type Props = {
    label: string;
    modelValue?: string;
    type?: "text" | "email";
    placeholder?: string;
    error?: string;
    hint?: string;
    autocomplete?: string;
    disabled?: boolean;
};

const props = withDefaults(defineProps<Props>(), { type: "text", disabled: false });
defineEmits<{ "update:modelValue": [value: string] }>();

const id = useId();
const describedBy = computed(() =>
    props.error ? `${id}-error` : props.hint ? `${id}-hint` : undefined,
);
</script>

<template>
    <div class="flex flex-col gap-1.5">
        <label
            :for="id"
            class="text-sm font-medium text-zinc-700 dark:text-slate-200"
            >{{ label }}</label
        >
        <input
            :id="id"
            :type="type"
            :value="modelValue"
            :placeholder="placeholder"
            :autocomplete="autocomplete"
            :disabled="disabled"
            :aria-invalid="error ? true : undefined"
            :aria-describedby="describedBy"
            class="w-full rounded-md border bg-white px-3 py-2.5 text-base text-zinc-900 placeholder-zinc-400 shadow-sm focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400 dark:disabled:bg-slate-800"
            :class="
                error
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/40 dark:border-red-500/70'
                    : 'border-zinc-300 focus:border-yellow-500 focus:ring-yellow-500/40 dark:border-slate-600'
            "
            @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        />
        <p
            v-if="error"
            :id="`${id}-error`"
            class="text-sm text-red-600 dark:text-red-400"
        >
            {{ error }}
        </p>
        <p
            v-else-if="hint"
            :id="`${id}-hint`"
            class="text-sm text-zinc-500 dark:text-slate-400"
        >
            {{ hint }}
        </p>
    </div>
</template>
