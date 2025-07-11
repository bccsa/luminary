<script setup lang="ts">
type Props = {
    disabled?: boolean;
    leftLabel: string;
    leftValue: string;
    rightLabel: string;
    rightValue: string;
};

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
});

const modelValue = defineModel<string>();

const updateValue = (newValue: string) => {
    if (!props.disabled) {
        modelValue.value = newValue;
    }
};
</script>

<template>
    <div
        class="inline-block h-10 rounded-full bg-zinc-100 p-1.5 shadow-inner"
        data-test="text-toggle"
    >
        <button
            :class="[
                'px-2 py-1 text-sm',
                { 'rounded-full bg-white shadow': modelValue == leftValue },
                { 'text-zinc-400': disabled },
                { 'text-zinc-900': !disabled && modelValue == leftValue },
                { 'text-zinc-700 ': !disabled && modelValue != leftValue },
            ]"
            @click="updateValue(leftValue)"
            :disabled="disabled"
            data-test="text-toggle-left-value"
        >
            {{ leftLabel }}
        </button>
        <button
            :class="[
                'px-2 py-1 text-sm',
                { 'rounded-full bg-white shadow': modelValue == rightValue },
                { 'text-zinc-400': disabled },
                { 'text-zinc-900': !disabled && modelValue == leftValue },
                { 'text-zinc-700 ': !disabled && modelValue != leftValue },
            ]"
            @click="updateValue(rightValue)"
            :disabled="disabled"
            data-test="text-toggle-right-value"
        >
            {{ rightLabel }}
        </button>
    </div>
</template>
