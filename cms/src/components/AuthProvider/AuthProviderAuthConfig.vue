<script setup lang="ts">
import type { AuthProviderDto } from "luminary-shared";
import LInput from "../forms/LInput.vue";

defineProps<{
    isEditing: boolean;
    disabled?: boolean;
}>();

const provider = defineModel<AuthProviderDto>("provider", { required: true });

/**
 * Strip protocol, trailing slashes, and paths so the domain is always
 * stored as a bare hostname (e.g. "auth.example.com").
 */
function normalizeDomainString(value: string | undefined): string {
    if (!value?.trim()) return value ?? "";
    let cleaned = value
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");

    if (cleaned.includes("/")) {
        try {
            cleaned = new URL(`https://${cleaned}`).hostname;
        } catch {
            // Not a valid URL — use as-is
        }
    }
    return cleaned;
}
</script>

<template>
    <div class="rounded-md border border-b border-zinc-200 bg-white p-2 pb-2">
        <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-medium text-gray-900">Auth Configuration</h3>
        </div>

        <div class="space-y-2">
            <div>
                <label for="domain" class="mb-1 block text-xs font-medium text-gray-700">
                    Domain
                    <span v-if="!isEditing" class="text-red-500">*</span>
                </label>
                <LInput
                    id="domain"
                    name="domain"
                    :model-value="provider.domain ?? ''"
                    type="text"
                    placeholder="auth.example.com"
                    :disabled="disabled"
                    :required="!isEditing"
                    @update:model-value="provider.domain = $event"
                    @blur="provider.domain = normalizeDomainString(provider.domain ?? '')"
                />
            </div>

            <div>
                <label for="clientId" class="mb-1 block text-xs font-medium text-gray-700">
                    Client ID
                    <span v-if="!isEditing" class="text-red-500">*</span>
                </label>
                <LInput
                    id="clientId"
                    name="clientId"
                    :model-value="provider.clientId ?? ''"
                    type="text"
                    placeholder="Your auth client ID"
                    :disabled="disabled"
                    :required="!isEditing"
                    @update:model-value="provider.clientId = $event"
                />
            </div>

            <div>
                <label for="audience" class="mb-1 block text-xs font-medium text-gray-700">
                    Audience
                    <span v-if="!isEditing" class="text-red-500">*</span>
                </label>
                <LInput
                    id="audience"
                    name="audience"
                    :model-value="provider.audience ?? ''"
                    type="text"
                    placeholder="https://your-api.example.com"
                    :disabled="disabled"
                    :required="!isEditing"
                    @update:model-value="provider.audience = $event"
                />
                <p class="mt-0.5 text-[11px] text-gray-500">
                    The API identifier/audience configured in your auth provider
                </p>
            </div>

            <div>
                <label for="claimNamespace" class="mb-1 block text-xs font-medium text-gray-700">
                    Claim Namespace
                </label>
                <LInput
                    id="claimNamespace"
                    name="claimNamespace"
                    :model-value="provider.claimNamespace ?? ''"
                    type="text"
                    placeholder="https://your-tenant.com/metadata"
                    :disabled="disabled"
                    @update:model-value="provider.claimNamespace = $event"
                />
                <p class="mt-0.5 text-[11px] text-gray-500">
                    The custom claim namespace configured in your auth provider's Actions/Rules
                </p>
            </div>
        </div>
    </div>
</template>
