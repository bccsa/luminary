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
    <label :for="props.for" class="flex gap-1 text-sm font-medium leading-6 text-zinc-900">
        <span><slot /></span>
        <span v-if="required">
            <span aria-hidden="true">*</span> <span class="sr-only">Required</span>
        </span>
    </label>
</template>
