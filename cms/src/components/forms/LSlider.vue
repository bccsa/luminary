<script setup lang="ts">
type Props = {
    min?: number;
    max?: number;
    step?: number;
    name: string;
    formatValue?: (value: number) => string;
};

const props = withDefaults(defineProps<Props>(), {
    min: 0,
    max: 1,
    step: 0.05,
    formatValue: () => (value: number) => String(value),
});

const model = defineModel<number>({ required: true });
</script>

<template>
    <div class="flex items-center gap-3">
        <input
            v-model.number="model"
            :name="name"
            type="range"
            :min="props.min"
            :max="props.max"
            :step="props.step"
            class="h-4 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-zinc-800 [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-zinc-200 [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-zinc-200 [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-800"
            :data-test="name"
        />
        <div class="w-12 text-right text-sm tabular-nums text-zinc-700">
            {{ formatValue(model) }}
        </div>
    </div>
</template>
