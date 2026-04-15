<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import DisplayCard from "./DisplayCard.vue";
import FormModal from "./FormModal.vue";
import LDialog from "../common/LDialog.vue";
import LButton from "@/components/button/LButton.vue";
import LCombobox from "@/components/forms/LCombobox.vue";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import { PlusIcon, GlobeAltIcon } from "@heroicons/vue/24/outline";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { isSmallScreen } from "@/globalConfig";
import { useAuthProviders } from "@/composables/useAuthProviders";
import { computed, nextTick, ref, useTemplateRef } from "vue";
import type { AuthProviderProviderConfig } from "luminary-shared";

type Props = {
    onOpenMobileSidebar?: () => void;
};

const { onOpenMobileSidebar } = defineProps<Props>();

const {
    groups,
    availableGroups,
    providers,
    authProviderConfig,
    isLoadingProviders,
    defaultPermissions,
    canDelete,
    canEdit,
    canEditDefaultPermissions,
    showModal,
    showDeleteModal,
    providerToDelete,
    isEditing,
    editingProviderId,
    currentProvider,
    isLoading,
    errors,
    isFormDirty,
    isDirtyAny,
    providerIsModified,
    isProviderEdited,
    openCreateModal,
    editProvider,
    deleteProvider,
    confirmDelete,
    saveProvider,
    duplicateProvider,
    revertProvider,
    editableDefaultGroups,
    isDefaultGroupsDirty,
    defaultGroupOptions,
    defaultGroupSelectedLabels,
    showDefaultGroupsDialog,
    isSavingDefaultGroups,
    openDefaultGroupsDialog,
    saveDefaultGroups,
} = useAuthProviders();

// Provider edit-state (editable ≠ shadow) for the currently edited provider.
// FormModal combines this with its local staging-diff to derive isDirty.
const currentProviderIsEdited = computed(() => isProviderEdited(editingProviderId.value));

// Imperative handle for FormModal's duplicate handoff — see prepareForDuplicate
// in FormModal.vue for why this dance is needed.
const formModalRef = useTemplateRef<{ prepareForDuplicate: () => void }>("formModalRef");

const hasAttemptedSubmit = ref(false);

async function handleSave(payload: { stagingConfig: AuthProviderProviderConfig }) {
    await saveProvider(payload.stagingConfig);
}

function handleDuplicate() {
    // Tell FormModal to preserve its staging across the upcoming provider swap,
    // then clone the doc and flip editingProviderId via the composable.
    formModalRef.value?.prepareForDuplicate();
    duplicateProvider();
}

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
                <LoadingSpinner class="mx-auto h-8 w-8" />
                <p class="mt-2 text-sm text-gray-500">Loading providers...</p>
            </div>

            <div v-else-if="!providers.length" class="px-6 py-8 text-center">
                <h3 class="mt-2 text-sm font-medium text-gray-900">No auth provider configured</h3>
                <p class="mt-1 text-sm text-gray-500">
                    Get started by creating your first OIDC auth provider.
                </p>
            </div>

            <div v-else class="flex flex-col gap-[3px]">
                <DisplayCard
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
    <FormModal
        ref="formModalRef"
        v-model:isVisible="showModal"
        v-model:provider="currentProvider"
        v-model:isDirty="isFormDirty"
        v-model:hasAttemptedSubmit="hasAttemptedSubmit"
        :isEditing="isEditing"
        :isLoading="isLoading"
        :errors="errors"
        :availableGroups="availableGroups"
        :canDelete="canDelete"
        :providerIsEdited="currentProviderIsEdited"
        :authProviderConfig="authProviderConfig"
        @save="handleSave"
        @delete="deleteProvider"
        @duplicate="handleDuplicate"
        @revert="revertProvider"
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
