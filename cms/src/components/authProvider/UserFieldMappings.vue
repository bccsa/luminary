<script setup lang="ts">
import type { AuthProviderProviderConfig } from "luminary-shared";
import LInput from "../forms/LInput.vue";

defineProps<{
    disabled?: boolean;
}>();

const providerConfig = defineModel<AuthProviderProviderConfig | undefined>("providerConfig");

function ensureUserFieldMappings() {
    if (!providerConfig.value) return;
    if (!providerConfig.value.userFieldMappings) {
        providerConfig.value.userFieldMappings = {};
    }
}
</script>

<template>
    <div class="rounded-md border border-zinc-200 bg-white p-2">
        <h3 class="mb-2 text-sm font-medium text-gray-900">User field names</h3>
        <p class="mb-2 text-[11px] text-gray-500">
            Override the JWT claim paths used to identify users. Leave blank to use standard OIDC
            defaults (<code>sub</code>, <code>email</code>, <code>name</code>).
        </p>
        <div class="space-y-2">
            <div>
                <label for="ufm-userId" class="mb-1 block text-xs font-medium text-gray-700"
                    >User ID claim</label
                >
                <LInput
                    id="ufm-userId"
                    name="ufm-userId"
                    :model-value="providerConfig?.userFieldMappings?.externalUserId ?? ''"
                    type="text"
                    placeholder="sub"
                    :disabled="disabled || !providerConfig"
                    @update:model-value="
                        (v) => {
                            ensureUserFieldMappings();
                            providerConfig!.userFieldMappings!.externalUserId = v || undefined;
                        }
                    "
                />
            </div>
            <div>
                <label for="ufm-email" class="mb-1 block text-xs font-medium text-gray-700"
                    >Email claim</label
                >
                <LInput
                    id="ufm-email"
                    name="ufm-email"
                    :model-value="providerConfig?.userFieldMappings?.email ?? ''"
                    type="text"
                    placeholder="email"
                    :disabled="disabled || !providerConfig"
                    @update:model-value="
                        (v) => {
                            ensureUserFieldMappings();
                            providerConfig!.userFieldMappings!.email = v || undefined;
                        }
                    "
                />
            </div>
            <div>
                <label for="ufm-name" class="mb-1 block text-xs font-medium text-gray-700"
                    >Name claim</label
                >
                <LInput
                    id="ufm-name"
                    name="ufm-name"
                    :model-value="providerConfig?.userFieldMappings?.name ?? ''"
                    type="text"
                    placeholder="name"
                    :disabled="disabled || !providerConfig"
                    @update:model-value="
                        (v) => {
                            ensureUserFieldMappings();
                            providerConfig!.userFieldMappings!.name = v || undefined;
                        }
                    "
                />
            </div>
        </div>
    </div>
</template>
