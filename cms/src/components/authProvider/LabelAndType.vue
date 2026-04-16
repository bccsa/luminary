<script setup lang="ts">
import type { AuthProviderDto } from "luminary-shared";
import LInput from "../forms/LInput.vue";

defineProps<{
    disabled?: boolean;
}>();

const provider = defineModel<AuthProviderDto>("provider", { required: true });
</script>

<template>
    <div>
        <label for="provider-label" class="mb-1 block text-xs font-medium text-gray-700">
            Label <span class="text-red-500">*</span>
        </label>
        <LInput
            id="provider-label"
            name="providerLabel"
            :model-value="provider.label ?? ''"
            type="text"
            placeholder="Brand/Company Name"
            :disabled="disabled"
            @update:model-value="provider.label = $event"
        />
    </div>
</template>
