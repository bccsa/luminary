<script setup lang="ts">
type Props = {
    for?: string;
    required?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    required: false,
});
</script>

<template>
    <label
        :for="props.for"
        class="flex gap-1 text-sm font-medium leading-6 text-zinc-900 dark:text-zinc-100"
    >
        <span class="text-sm"><slot /></span>
        <span v-if="required" class="text-red-600 dark:text-red-400">
            <span aria-hidden="true">*</span> <span class="sr-only">Required</span>
        </span>
    </label>
</template>
