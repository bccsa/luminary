<script setup lang="ts">
import type { AuthProviderDto } from "luminary-shared";
import LInput from "../forms/LInput.vue";

defineProps<{
    disabled?: boolean;
}>();

const provider = defineModel<AuthProviderDto>("provider", { required: true });
</script>

<template>
    <div class="min-w-0 w-full max-w-full">
        <label for="provider-label" class="mb-1 block text-xs font-medium text-gray-700">
            Label
        </label>
        <LInput
            id="provider-label"
            name="providerLabel"
            :model-value="provider.label ?? ''"
            type="text"
            placeholder="e.g. login.bcc.button"
            :disabled="disabled"
            @update:model-value="provider.label = $event"
        />

        <div class="mt-2">
            <label for="provider-display-name" class="mb-1 block text-xs font-medium text-gray-700">
                Display name
            </label>
            <LInput
                id="provider-display-name"
                name="providerDisplayName"
                :model-value="provider.displayName ?? ''"
                type="text"
                placeholder="e.g. Login with BCC"
                :disabled="disabled"
                @update:model-value="provider.displayName = $event"
            />
            <p class="mt-1 text-[11px] text-gray-500">
                This name is shown in CMS lists and dialogs.
            </p>
        </div>
    </div>
</template>
