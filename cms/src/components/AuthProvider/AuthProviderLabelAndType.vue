<script setup lang="ts">
import LInput from "../forms/LInput.vue";

defineProps<{
    label: string | undefined;
    disabled?: boolean;
}>();

const emit = defineEmits<{
    "update:label": [value: string];
}>();
</script>

<template>
    <div>
        <label for="provider-label" class="mb-1 block text-xs font-medium text-gray-700">
            Label <span class="text-red-500">*</span>
        </label>
        <LInput
            id="provider-label"
            name="providerLabel"
            :model-value="label ?? ''"
            type="text"
            placeholder="Brand/Company Name"
            :disabled="disabled"
            @update:model-value="emit('update:label', $event)"
        />
    </div>
</template>
