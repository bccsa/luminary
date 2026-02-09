<script setup lang="ts">
import { ref, watch } from "vue";
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import { type OAuthProviderDto, type Auth0CredentialDto, type GroupDto } from "luminary-shared";
import LModal from "../modals/LModal.vue";
import LInput from "../forms/LInput.vue";
import LCombobox from "../forms/LCombobox.vue";
import { XCircleIcon } from "@heroicons/vue/20/solid";

const props = defineProps<{
    isVisible: boolean;
    provider: OAuthProviderDto | undefined;
    isEditing: boolean;
    isLoading: boolean;
    errors: string[] | undefined;
    availableGroups: GroupDto[];
    canDelete: boolean;
    isFormValid: boolean;
    hasAttemptedSubmit: boolean;
    localCredentials: Auth0CredentialDto;
    hasValidCredentials: boolean;
}>();

const emit = defineEmits<{
    "update:isVisible": [value: boolean];
    "update:provider": [value: OAuthProviderDto];
    "update:localCredentials": [value: Auth0CredentialDto];
    save: [];
    delete: [];
}>();

const showCredentials = ref(false);

// Watch for modal visibility changes
watch(
    () => props.isVisible,
    (visible) => {
        if (visible) {
            showCredentials.value = false;
        }
    },
);

function closeModal() {
    emit("update:isVisible", false);
}

function handleSave() {
    emit("save");
}

function handleDelete() {
    emit("delete");
}
</script>

<template>
    <LModal
        :isVisible="isVisible"
        @update:isVisible="(value?: boolean) => emit('update:isVisible', value ?? false)"
        :heading="isEditing ? 'Edit OAuth Provider' : 'Create New OAuth Provider'"
    >
        <div class="max-h-[500px] overflow-auto scrollbar-hide">
            <!-- Error display -->
            <div v-if="errors" class="mb-3">
                <div v-for="(error, idx) in errors" :key="idx" class="mb-1 flex items-center gap-2">
                    <XCircleIcon class="h-4 w-4 flex-shrink-0 text-red-400" />
                    <p class="text-xs text-zinc-700">{{ error }}</p>
                </div>
            </div>

            <div class="space-y-2" v-if="provider">
                <!-- Provider Label -->
                <div>
                    <label
                        for="provider-label"
                        class="mb-1 block text-xs font-medium text-gray-700"
                    >
                        Label <span class="text-red-500">*</span>
                    </label>
                    <LInput
                        id="provider-label"
                        name="providerLabel"
                        :model-value="provider.label"
                        @update:model-value="
                            (value) =>
                                emit('update:provider', {
                                    ...provider,
                                    label: value,
                                } as OAuthProviderDto)
                        "
                        type="text"
                        placeholder="Production Auth0 or Development Auth0"
                    />
                </div>

                <!-- Provider Type (readonly for now, only Auth0 supported) -->
                <div>
                    <label class="mb-1 block text-xs font-medium text-gray-700"
                        >Provider Type</label
                    >
                    <div
                        class="rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                    >
                        Auth0
                    </div>
                    <p class="mt-0.5 text-[11px] text-gray-500">
                        Currently only Auth0 is supported
                    </p>
                </div>

                <!-- Group Membership -->
                <div>
                    <LCombobox
                        :selected-options="provider.memberOf as string[]"
                        @update:selected-options="
                            (value: (string | number)[]) =>
                                emit('update:provider', {
                                    ...provider,
                                    memberOf: value as string[],
                                } as OAuthProviderDto)
                        "
                        :label="`Group Membership`"
                        :options="
                            availableGroups.map((group: GroupDto) => ({
                                id: group._id,
                                label: group.name,
                                value: group._id,
                            }))
                        "
                        :show-selected-in-dropdown="false"
                        :showSelectedLabels="true"
                        :disabled="false"
                        data-test="groupSelector"
                    />
                </div>

                <!-- Auth0 Credentials -->
                <div class="border-t pt-2">
                    <div class="mb-2 flex items-center justify-between">
                        <h3 class="text-sm font-medium text-gray-900">
                            Auth0 Credentials
                            <span v-if="!isEditing" class="text-red-500">*</span>
                        </h3>
                        <LButton
                            @click="showCredentials = !showCredentials"
                            variant="tertiary"
                            size="sm"
                        >
                            {{ showCredentials ? "Hide" : isEditing ? "Update" : "Set" }}
                        </LButton>
                    </div>

                    <!-- Required notice for new providers -->
                    <div
                        v-if="
                            !isEditing &&
                            !showCredentials &&
                            hasAttemptedSubmit &&
                            !hasValidCredentials
                        "
                        class="mb-2 rounded-md border border-red-200 bg-red-50 p-2"
                    >
                        <div class="flex gap-2">
                            <div class="flex-shrink-0">
                                <ExclamationTriangleIcon class="h-4 w-4 text-red-400" />
                            </div>
                            <div>
                                <h3 class="text-xs font-medium text-red-800">
                                    Credentials Required
                                </h3>
                                <p class="mt-0.5 text-xs text-red-700">
                                    Click "Set" above to provide Auth0 credentials.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div v-if="showCredentials" class="space-y-2">
                        <!-- Security Notice -->
                        <div class="rounded-md border border-yellow-200 bg-yellow-50 p-2">
                            <div class="flex gap-2">
                                <ExclamationTriangleIcon
                                    class="h-4 w-4 flex-shrink-0 text-yellow-600"
                                />
                                <p class="text-[11px] text-yellow-800">
                                    Credentials are encrypted and not retrievable after storage.
                                    {{ isEditing ? "Leave empty to keep existing." : "" }}
                                </p>
                            </div>
                        </div>

                        <!-- Domain -->
                        <div>
                            <label
                                for="domain"
                                class="mb-1 block text-xs font-medium text-gray-700"
                            >
                                Domain <span v-if="!isEditing" class="text-red-500">*</span>
                            </label>
                            <LInput
                                id="domain"
                                name="domain"
                                :model-value="localCredentials.domain"
                                @update:model-value="
                                    (value) =>
                                        emit('update:localCredentials', {
                                            ...localCredentials,
                                            domain: value,
                                        })
                                "
                                type="text"
                                placeholder="your-tenant.auth0.com"
                                :disabled="isLoading"
                                :required="!isEditing"
                            />
                        </div>

                        <!-- Client ID -->
                        <div>
                            <label
                                for="clientId"
                                class="mb-1 block text-xs font-medium text-gray-700"
                            >
                                Client ID <span v-if="!isEditing" class="text-red-500">*</span>
                            </label>
                            <LInput
                                id="clientId"
                                name="clientId"
                                :model-value="localCredentials.clientId"
                                @update:model-value="
                                    (value) =>
                                        emit('update:localCredentials', {
                                            ...localCredentials,
                                            clientId: value,
                                        })
                                "
                                type="text"
                                placeholder="Your Auth0 Client ID"
                                :disabled="isLoading"
                                :required="!isEditing"
                            />
                        </div>

                        <!-- Client Secret -->
                        <div>
                            <label
                                for="clientSecret"
                                class="mb-1 block text-xs font-medium text-gray-700"
                            >
                                Client Secret <span v-if="!isEditing" class="text-red-500">*</span>
                            </label>
                            <LInput
                                id="clientSecret"
                                name="clientSecret"
                                :model-value="localCredentials.clientSecret"
                                @update:model-value="
                                    (value) =>
                                        emit('update:localCredentials', {
                                            ...localCredentials,
                                            clientSecret: value,
                                        })
                                "
                                type="password"
                                placeholder="Your Auth0 Client Secret"
                                :disabled="isLoading"
                                :required="!isEditing"
                            />
                        </div>

                        <!-- Audience -->
                        <div>
                            <label
                                for="audience"
                                class="mb-1 block text-xs font-medium text-gray-700"
                            >
                                Audience <span v-if="!isEditing" class="text-red-500">*</span>
                            </label>
                            <LInput
                                id="audience"
                                name="audience"
                                :model-value="localCredentials.audience"
                                @update:model-value="
                                    (value) =>
                                        emit('update:localCredentials', {
                                            ...localCredentials,
                                            audience: value,
                                        })
                                "
                                type="text"
                                placeholder="https://your-api.example.com"
                                :disabled="isLoading"
                                :required="!isEditing"
                            />
                            <p class="mt-0.5 text-[11px] text-gray-500">
                                The API identifier/audience configured in Auth0
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Actions buttons -->
        <div class="flex justify-between border-t pt-3">
            <div>
                <LButton
                    v-if="isEditing && canDelete"
                    @click="handleDelete"
                    variant="secondary"
                    context="danger"
                    size="sm"
                    :disabled="isLoading"
                >
                    Delete
                </LButton>
            </div>
            <div class="flex gap-2">
                <LButton @click="closeModal" variant="secondary" size="sm" :disabled="isLoading">
                    Cancel
                </LButton>
                <LButton
                    variant="primary"
                    size="sm"
                    @click="handleSave"
                    :disabled="isLoading || !isFormValid"
                    :loading="isLoading"
                >
                    {{ isEditing ? "Update" : "Create" }}
                </LButton>
            </div>
        </div>
    </LModal>
</template>
