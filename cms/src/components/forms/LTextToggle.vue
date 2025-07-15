\
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
        class="inline-flex h-8 items-center gap-1 rounded-full bg-zinc-100 p-1 shadow-inner transition-all sm:h-9 sm:gap-2 sm:p-1.5 md:h-10 md:p-2"
        data-test="text-toggle"
    >
        <button
            :class="[
                'rounded-full px-2 py-0.5 text-xs transition-all sm:px-3 sm:py-1 sm:text-sm',
                { 'bg-white text-zinc-900 shadow': modelValue == leftValue && !disabled },
                { 'text-zinc-700': modelValue != leftValue && !disabled },
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
                'rounded-full px-2 py-0.5 text-xs transition-all sm:px-3 sm:py-1 sm:text-sm',
                { 'bg-white text-zinc-900 shadow': modelValue == rightValue && !disabled },
                { 'text-zinc-700': modelValue != rightValue && !disabled },
                { 'text-zinc-400': disabled },
            ]"
            @click="updateValue(rightValue)"
            :disabled="disabled"
            data-test="text-toggle-right-value"
        >
            {{ rightLabel }}
        </button>
    </div>
</template>
