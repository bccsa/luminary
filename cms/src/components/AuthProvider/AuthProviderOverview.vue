<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import AuthProviderDisplayCard from "./AuthProviderDisplayCard.vue";
import AuthProviderFormModal from "./AuthProviderFormModal.vue";
import LDialog from "../common/LDialog.vue";
import LButton from "@/components/button/LButton.vue";
import LCombobox from "@/components/forms/LCombobox.vue";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import { PlusIcon, GlobeAltIcon } from "@heroicons/vue/24/outline";
import { isSmallScreen } from "@/globalConfig";
import { useAuthProviders } from "@/composables/useAuthProviders";

type Props = {
    onOpenMobileSidebar?: () => void;
};

const { onOpenMobileSidebar } = defineProps<Props>();

const {
    groups,
    availableGroups,
    providers,
    isLoadingProviders,
    defaultPermissions,
    canDelete,
    canEdit,
    canEditDefaultPermissions,
    showModal,
    showDeleteModal,
    providerToDelete,
    isEditing,
    currentProvider,
    currentProviderConfig,
    isLoading,
    errors,
    isDirty,
    isDirtyAny,
    providerIsModified,
    hasAttemptedSubmit,
    isFormValid,
    openCreateModal,
    editProvider,
    deleteProvider,
    confirmDelete,
    saveProvider,
    editableDefaultGroups,
    isDefaultGroupsDirty,
    defaultGroupOptions,
    defaultGroupSelectedLabels,
    showDefaultGroupsDialog,
    isSavingDefaultGroups,
    openDefaultGroupsDialog,
    saveDefaultGroups,
} = useAuthProviders();

defineExpose({
    openCreateModal,
});
</script>

<template>
    <BasePage
        :is-full-width="true"
        title="Auth providers overview"
        :should-show-page-title="false"
        :onOpenMobileSidebar="onOpenMobileSidebar"
    >
        <template #pageNav>
            <div class="flex items-center gap-2">
                <GlobeAltIcon
                    v-if="canEditDefaultPermissions && defaultPermissions && isSmallScreen"
                    class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                    data-test="global-group-access"
                    @click="openDefaultGroupsDialog"
                />
                <LButton
                    v-if="canEditDefaultPermissions && defaultPermissions && !isSmallScreen"
                    variant="secondary"
                    :icon="GlobeAltIcon"
                    data-test="global-group-access"
                    @click="openDefaultGroupsDialog"
                >
                    Global User Access
                </LButton>
                <LButton
                    v-if="canEdit && !isSmallScreen"
                    variant="primary"
                    :icon="PlusIcon"
                    data-test="create-auth-provider"
                    @click="openCreateModal"
                >
                    Create provider
                </LButton>
                <PlusIcon
                    v-else-if="canEdit && isSmallScreen"
                    class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                    @click="openCreateModal"
                />
            </div>
        </template>

        <div class="mt-1">
            <div v-if="isLoadingProviders && !providers.length" class="px-6 py-8 text-center">
                <div
                    class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"
                ></div>
                <p class="mt-2 text-sm text-gray-500">Loading providers...</p>
            </div>

            <div v-else-if="!providers.length" class="px-6 py-8 text-center">
                <h3 class="mt-2 text-sm font-medium text-gray-900">No auth provider configured</h3>
                <p class="mt-1 text-sm text-gray-500">
                    Get started by creating your first OIDC auth provider.
                </p>
            </div>

            <div v-else class="flex flex-col gap-[3px]">
                <AuthProviderDisplayCard
                    v-for="(provider, i) in providers"
                    :key="provider._id || provider.label"
                    :provider="provider"
                    :groups="groups"
                    :isModified="providerIsModified(provider._id)"
                    :class="{ 'mb-4': i === providers.length - 1 }"
                    @edit="editProvider"
                />
            </div>
        </div>
    </BasePage>

    <!-- Create/Edit Provider Modal -->
    <AuthProviderFormModal
        v-model:isVisible="showModal"
        v-model:provider="currentProvider"
        v-model:providerConfig="currentProviderConfig"
        :isEditing="isEditing"
        :isLoading="isLoading"
        :errors="errors"
        :availableGroups="availableGroups"
        :canDelete="canDelete"
        :isFormValid="isFormValid"
        :isDirty="isDirty"
        :hasAttemptedSubmit="hasAttemptedSubmit"
        @save="saveProvider"
        @delete="deleteProvider"
    />

    <LDialog
        v-model:open="showDefaultGroupsDialog"
        title="Global User Access"
        primaryButtonText="Save"
        secondaryButtonText="Cancel"
        :primaryAction="saveDefaultGroups"
        :secondaryAction="() => (showDefaultGroupsDialog = false)"
        :primaryButtonDisabled="!isDefaultGroupsDirty || isSavingDefaultGroups"
        data-test="default-groups-dialog"
    >
        <p class="text-sm text-gray-500">
            Unauthenticated and authenticated users has access to these groups.
        </p>
        <div class="mt-4">
            <LCombobox
                v-model:selectedOptions="editableDefaultGroups"
                :options="defaultGroupOptions"
                :selectedLabels="defaultGroupSelectedLabels"
                :showSelectedInDropdown="false"
                badgeVariant="blue"
            />
        </div>
    </LDialog>

    <LDialog
        v-model:open="showDeleteModal"
        :title="`Delete Provider ${providerToDelete?.label}?`"
        :description="`Are you sure you want to delete this auth provider? This action cannot be undone.`"
        :primaryAction="
            () => {
                confirmDelete();
            }
        "
        :secondaryAction="() => (showDeleteModal = false)"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        context="danger"
    ></LDialog>

    <ConfirmBeforeLeavingModal :isDirty="isDirtyAny" />
</template>
