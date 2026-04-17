<script setup lang="ts">
import type { AuthProviderDto } from "luminary-shared";
import LInput from "../forms/LInput.vue";

defineProps<{
    disabled?: boolean;
}>();

const provider = defineModel<AuthProviderDto | undefined>("provider");

// Lazily materialise the userFieldMappings object only when the user actually
// writes a value. Writing on mount (e.g. to have a place to assign into) would
// make the editable doc diverge from the shadow even though the user hasn't
// touched anything, tripping the isEdited dirty flag on modal open.
function setMapping(key: "externalUserId" | "email" | "name", value: string) {
    if (!provider.value) return;
    const trimmed = value || undefined;
    const existing = provider.value.userFieldMappings;

    if (!existing) {
        if (!trimmed) return; // nothing to store and nothing to mutate
        provider.value.userFieldMappings = { [key]: trimmed };
        return;
    }

    existing[key] = trimmed;

    // If all three sub-fields are now unset, drop the object entirely so the
    // doc's JSON shape matches a freshly-seeded provider (keeps saves idempotent).
    if (!existing.externalUserId && !existing.email && !existing.name) {
        provider.value.userFieldMappings = undefined;
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
                    :model-value="provider?.userFieldMappings?.externalUserId ?? ''"
                    type="text"
                    placeholder="sub"
                    :disabled="disabled || !provider"
                    @update:model-value="(v) => setMapping('externalUserId', v)"
                />
            </div>
            <div>
                <label for="ufm-email" class="mb-1 block text-xs font-medium text-gray-700"
                    >Email claim</label
                >
                <LInput
                    id="ufm-email"
                    name="ufm-email"
                    :model-value="provider?.userFieldMappings?.email ?? ''"
                    type="text"
                    placeholder="email"
                    :disabled="disabled || !provider"
                    @update:model-value="(v) => setMapping('email', v)"
                />
            </div>
            <div>
                <label for="ufm-name" class="mb-1 block text-xs font-medium text-gray-700"
                    >Name claim</label
                >
                <LInput
                    id="ufm-name"
                    name="ufm-name"
                    :model-value="provider?.userFieldMappings?.name ?? ''"
                    type="text"
                    placeholder="name"
                    :disabled="disabled || !provider"
                    @update:model-value="(v) => setMapping('name', v)"
                />
            </div>
        </div>
    </div>
</template>
