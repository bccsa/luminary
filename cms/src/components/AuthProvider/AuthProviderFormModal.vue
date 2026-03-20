<script setup lang="ts">
import type { AuthProviderConfigDto, AuthProviderDto, GroupDto } from "luminary-shared";
import { computed } from "vue";
import LModal from "../modals/LModal.vue";
import LCombobox from "../forms/LCombobox.vue";
import AuthProviderFormErrors from "./AuthProviderFormErrors.vue";
import AuthProviderAuthConfig from "./AuthProviderAuthConfig.vue";
import AuthProviderLabelAndType from "./AuthProviderLabelAndType.vue";
import AuthProviderIconSection from "./AuthProviderIconSection.vue";
import AuthProviderAppearance from "./AuthProviderAppearance.vue";
import AuthProviderUserFieldMappings from "./AuthProviderUserFieldMappings.vue";
import AuthProviderGroupMappings from "./AuthProviderGroupMappings.vue";
import AuthProviderFormActions from "./AuthProviderFormActions.vue";

const props = defineProps<{
    isEditing: boolean;
    isLoading: boolean;
    errors: string[] | undefined;
    availableGroups: GroupDto[];
    canDelete: boolean;
    isFormValid: boolean;
    isDirty: boolean;
    hasAttemptedSubmit: boolean;
}>();

const emit = defineEmits<{
    save: [];
    delete: [];
}>();

const isVisible = defineModel<boolean>("isVisible");
const provider = defineModel<AuthProviderDto | undefined>("provider");
const providerConfig = defineModel<AuthProviderConfigDto | undefined>("providerConfig");

const groupOptions = computed(() =>
    props.availableGroups.map((group: GroupDto) => ({
        id: group._id,
        label: group.name,
        value: group._id,
    })),
);

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
            class="mb-1 min-h-0 flex-1 overflow-auto md:flex md:gap-4 md:overflow-hidden"
        >
            <!-- Left column -->
            <div v-if="provider" class="space-y-2 md:min-h-0 md:flex-1 md:overflow-y-auto">
                <AuthProviderFormErrors :errors="errors ?? []" />

                <AuthProviderLabelAndType v-model:provider="provider" :disabled="isLoading" />

                <div class="rounded-md border border-zinc-200 bg-white p-2">
                    <LCombobox
                        v-model:selected-options="provider.memberOf as string[]"
                        :label="`Group Membership`"
                        :options="groupOptions"
                        :show-selected-in-dropdown="false"
                        :showSelectedLabels="true"
                        :disabled="false"
                        data-test="groupSelector"
                    />
                </div>

                <AuthProviderAuthConfig
                    v-model:provider="provider"
                    v-model:providerConfig="providerConfig"
                    :is-editing="isEditing"
                    :disabled="isLoading"
                />

                <AuthProviderIconSection
                    :provider="provider"
                    :disabled="isLoading"
                    @update:icon-opacity="
                        (v) => {
                            if (provider) provider.iconOpacity = v;
                        }
                    "
                />

                <AuthProviderAppearance v-model:provider="provider" :disabled="isLoading" />
            </div>

            <!-- Right column -->
            <div
                v-if="provider"
                class="mt-2 space-y-2 md:mt-0 md:min-h-0 md:flex-1 md:overflow-y-auto md:border-l md:border-gray-200 md:pl-4"
            >
                <span class="text-md text-zinc-500"
                    >Automatically assign users to groups based on claims or attributes returned by
                    this authentication provider.</span
                >
                <AuthProviderUserFieldMappings
                    v-model:providerConfig="providerConfig"
                    :disabled="isLoading"
                />

                <AuthProviderGroupMappings
                    v-if="providerConfig"
                    v-model="providerConfig.groupMappings"
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
            :is-dirty="isDirty"
            @save="handleSave"
            @delete="handleDelete"
            @close="closeModal"
        />
    </LModal>
</template>
