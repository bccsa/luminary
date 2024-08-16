<script setup lang="ts">
type Props = {
    disabled?: boolean;
    leftLabel: string;
    leftValue: string;
    rightLabel: string;
    rightValue: string;
};

withDefaults(defineProps<Props>(), {
    disabled: false,
});

const modelValue = defineModel<string>();
</script>

<template>
    <div class="inline-block h-10 rounded-full bg-zinc-100 p-1.5" data-test="text-toggle">
        <button
            :class="[
                'px-4 py-1 text-sm',
                { 'rounded-full bg-white text-zinc-900 shadow': modelValue == leftValue },
                { 'text-zinc-700 ': modelValue != leftValue },
            ]"
            @click="modelValue = leftValue"
            data-test="text-toggle-left-value"
        >
            {{ leftLabel }}
        </button>
        <button
            :class="[
                'px-4 py-1 text-sm',
                { 'rounded-full bg-white text-zinc-900 shadow': modelValue == rightValue },
                { 'text-zinc-700 ': modelValue != rightValue },
            ]"
            @click="modelValue = rightValue"
            data-test="text-toggle-right-value"
        >
            {{ rightLabel }}
        </button>
    </div>
</template>
