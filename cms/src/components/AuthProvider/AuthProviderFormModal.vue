<script setup lang="ts">
import type { AuthProviderDto, GroupDto } from "luminary-shared";
import LModal from "../modals/LModal.vue";
import LCombobox from "../forms/LCombobox.vue";
import AuthProviderFormErrors from "./AuthProviderFormErrors.vue";
import AuthProviderAuthConfig from "./AuthProviderAuthConfig.vue";
import AuthProviderLabelAndType from "./AuthProviderLabelAndType.vue";
import AuthProviderIconSection from "./AuthProviderIconSection.vue";
import AuthProviderAppearance from "./AuthProviderAppearance.vue";
import AuthProviderUserFieldMappings from "./AuthProviderUserFieldMappings.vue";
import AuthProviderClaimMappings from "./AuthProviderClaimMappings.vue";
import AuthProviderGroupMappings from "./AuthProviderGroupMappings.vue";
import AuthProviderFormActions from "./AuthProviderFormActions.vue";

defineProps<{
    isEditing: boolean;
    isLoading: boolean;
    errors: string[] | undefined;
    availableGroups: GroupDto[];
    canDelete: boolean;
    isFormValid: boolean;
    hasAttemptedSubmit: boolean;
}>();

const emit = defineEmits<{
    save: [];
    delete: [];
}>();

const isVisible = defineModel<boolean>("isVisible");
const provider = defineModel<AuthProviderDto | undefined>("provider");

const closeModal = () => {
    isVisible.value = false;
};

const handleSave = () => {
    emit("save");
};

const handleDelete = () => {
    emit("delete");
};
</script>

<template>
    <LModal
        v-model:isVisible="isVisible"
        large-modal
        :heading="isEditing ? 'Edit Auth Provider' : 'Add Auth Provider'"
    >
        <div
            ref="scrollContainer"
            class="mb-1 max-h-[70vh] overflow-auto md:flex md:gap-4 md:overflow-hidden"
        >
            <!-- Left column -->
            <div v-if="provider" class="space-y-2 md:min-h-0 md:flex-1 md:overflow-y-auto">
                <AuthProviderFormErrors :errors="errors ?? []" />

                <AuthProviderLabelAndType
                    :label="provider?.label"
                    :disabled="isLoading"
                    @update:label="(v) => provider && (provider.label = v)"
                />

                <div class="rounded-md border border-zinc-200 bg-white p-2">
                    <LCombobox
                        v-model:selected-options="provider.memberOf as string[]"
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

                <AuthProviderAuthConfig
                    :domain="provider?.domain"
                    :client-id="provider?.clientId"
                    :audience="provider?.audience"
                    :claim-namespace="provider?.claimNamespace"
                    :is-editing="isEditing"
                    :disabled="isLoading"
                    @update:domain="(v) => provider && (provider.domain = v)"
                    @update:client-id="(v) => provider && (provider.clientId = v)"
                    @update:audience="(v) => provider && (provider.audience = v)"
                    @update:claim-namespace="(v) => provider && (provider.claimNamespace = v)"
                />

                <AuthProviderIconSection
                    :provider="provider"
                    :icon-opacity="provider?.iconOpacity"
                    :disabled="isLoading"
                    @update:icon-opacity="(v) => provider && (provider.iconOpacity = v)"
                />

                <AuthProviderAppearance
                    :text-color="provider?.textColor"
                    :background-color="provider?.backgroundColor"
                    :disabled="isLoading"
                    @update:text-color="(v) => provider && (provider.textColor = v)"
                    @update:background-color="(v) => provider && (provider.backgroundColor = v)"
                />
            </div>

            <!-- Right column -->
            <div
                v-if="provider"
                class="mt-2 space-y-2 md:mt-0 md:min-h-0 md:flex-1 md:overflow-y-auto md:border-l md:border-gray-200 md:pl-4"
            >
                <AuthProviderUserFieldMappings :provider="provider" :disabled="isLoading" />

                <AuthProviderClaimMappings v-model="provider.claimMappings" :disabled="isLoading" />

                <AuthProviderGroupMappings
                    v-model="provider.groupMappings"
                    :available-groups="availableGroups"
                    :disabled="isLoading"
                />
            </div>
        </div>

        <AuthProviderFormActions
            :is-editing="isEditing"
            :is-loading="isLoading"
            :can-delete="canDelete"
            :is-form-valid="isFormValid"
            @save="handleSave"
            @delete="handleDelete"
            @close="closeModal"
        />
    </LModal>
</template>
