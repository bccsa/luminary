<script setup lang="ts">
import { toRefs } from "vue";

type Props = {
    modelValue: string;
    disabled?: boolean;
    leftLabel: string;
    leftValue: string;
    rightLabel: string;
    rightValue: string;
};

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
});

const { modelValue } = toRefs(props);

const emit = defineEmits(["update:modelValue"]);
</script>

<template>
    <div class="inline-block rounded-full bg-zinc-100 p-1.5" data-test="text-toggle">
        <button
            :class="[' px-4 py-1', { 'rounded-full bg-white shadow ': modelValue == leftValue }]"
            @click="emit('update:modelValue', leftValue)"
            data-test="text-toggle-left-value"
        >
            {{ leftLabel }}
        </button>
        <button
            :class="['px-4 py-1', { 'rounded-full bg-white shadow ': modelValue == rightValue }]"
            @click="emit('update:modelValue', rightValue)"
            data-test="text-toggle-right-value"
        >
            {{ rightLabel }}
        </button>
    </div>
</template>
