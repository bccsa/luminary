<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import DisplayCard from "./DisplayCard.vue";
import FormModal from "./FormModal.vue";
import LDialog from "../common/LDialog.vue";
import LButton from "@/components/button/LButton.vue";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import FilterOptions from "@/components/common/FilterOptions.vue";
import EmptyState from "@/components/EmptyState.vue";
import { isSmallScreen } from "@/globalConfig";
import { useAuthProviders } from "@/composables/useAuthProviders";
import { computed, reactive, ref, useTemplateRef } from "vue";

type Props = {
    onOpenMobileSidebar?: () => void;
};

const { onOpenMobileSidebar } = defineProps<Props>();

// `reactive` unwraps the composable's refs so members are read/written via dot notation
// (no `.value`) in script, template, and v-model alike — no large destructure block.
const authProviders = reactive(useAuthProviders());

// Provider edit-state (editable ≠ shadow) for the currently edited provider.
// FormModal combines this with its local staging-diff to derive isDirty.
const currentProviderIsEdited = computed(() =>
    authProviders.isProviderEdited(authProviders.editingProviderId),
);

// Imperative handle for FormModal's duplicate handoff — see prepareForDuplicate
// in FormModal.vue for why this dance is needed.
const formModalRef = useTemplateRef<{ prepareForDuplicate: () => void }>("formModalRef");

const hasAttemptedSubmit = ref(false);

async function handleSave() {
    await authProviders.saveProvider();
}

function handleDuplicate() {
    formModalRef.value?.prepareForDuplicate();
    authProviders.duplicateProvider();
}

// ── Filter state ────────────────────────────────────────────────────────────

const searchQuery = ref("");
const selectedGroupFilter = ref<string[]>([]);

const filteredProviders = computed(() => {
    let result = authProviders.providers;
    if (selectedGroupFilter.value.length > 0) {
        result = result.filter((p) =>
            (p.memberOf ?? []).some((gid: string) => selectedGroupFilter.value.includes(gid)),
        );
    }
    const q = searchQuery.value.trim().toLowerCase();
    if (q) {
        result = result.filter(
            (p) =>
                (p.displayName ?? "").toLowerCase().includes(q) ||
                (p.label ?? "").toLowerCase().includes(q) ||
                (p.domain ?? "").toLowerCase().includes(q),
        );
    }
    return result;
});

const hasAnyContent = computed(() => authProviders.providers.length > 0);

defineExpose({
    openCreateModal: authProviders.openCreateModal,
});
</script>

<template>
    <BasePage
        :is-full-width="true"
        title="Auth providers overview"
        :should-show-page-title="false"
        :onOpenMobileSidebar="onOpenMobileSidebar"
        :loading="authProviders.isLoadingProviders"
    >
        <template #topBarActionsDesktop>
            <LButton
                v-if="authProviders.canEdit && hasAnyContent && !isSmallScreen"
                variant="primary"
                :icon="PlusIcon"
                data-test="create-auth-provider"
                @click="authProviders.openCreateModal"
            >
                Create provider
            </LButton>
        </template>
        <template #topBarActionsMobile>
            <PlusIcon
                v-if="authProviders.canEdit && hasAnyContent && isSmallScreen"
                class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                @click="authProviders.openCreateModal"
            />
        </template>

        <template v-if="hasAnyContent" #internalPageHeader>
            <FilterOptions
                v-model:search="searchQuery"
                v-model:selected-groups="selectedGroupFilter"
                :groups="authProviders.groups"
                :is-small-screen="isSmallScreen"
            />
        </template>

        <div class="flex flex-col gap-[3px]">
            <EmptyState
                v-if="!hasAnyContent"
                title="No auth provider configured"
                description="Get started by creating your first OIDC auth provider."
                :button-text="authProviders.canEdit ? 'Create provider' : undefined"
                :button-action="authProviders.canEdit ? authProviders.openCreateModal : undefined"
                :button-permission="authProviders.canEdit"
                show-back-button
            />

            <EmptyState
                v-else-if="hasAnyContent && !filteredProviders.length"
                title="No providers match the current filters"
                description="Try adjusting your search or filter criteria."
            />

            <template v-else>
                <DisplayCard
                    v-for="(provider, i) in filteredProviders"
                    :key="provider._id || provider.label"
                    :provider="provider"
                    :groups="authProviders.groups"
                    :isModified="authProviders.providerIsModified(provider._id)"
                    :class="{ 'mb-4': i === filteredProviders.length - 1 }"
                    @edit="authProviders.editProvider"
                />
            </template>
        </div>
    </BasePage>

    <!-- Create/Edit Provider Modal -->
    <FormModal
        ref="formModalRef"
        v-model:isVisible="authProviders.showModal"
        v-model:provider="authProviders.currentProvider"
        v-model:isDirty="authProviders.isFormDirty"
        v-model:hasAttemptedSubmit="hasAttemptedSubmit"
        :isEditing="authProviders.isEditing"
        :isLoading="authProviders.isLoading"
        :errors="authProviders.errors"
        :availableGroups="authProviders.availableGroups"
        :canEdit="authProviders.canEdit"
        :canDelete="authProviders.canDelete"
        :providerIsEdited="currentProviderIsEdited"
        @save="handleSave"
        @delete="authProviders.deleteProvider"
        @duplicate="handleDuplicate"
        @revert="authProviders.revertProvider"
    />

    <LDialog
        v-model:open="authProviders.showDeleteModal"
        :title="`Delete Provider ${authProviders.providerToDelete?.displayName || authProviders.providerToDelete?.label}?`"
        :description="`Are you sure you want to delete this auth provider? This action cannot be undone.`"
        :primaryAction="
            () => {
                authProviders.confirmDelete();
            }
        "
        :secondaryAction="() => (authProviders.showDeleteModal = false)"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        context="danger"
    ></LDialog>

    <ConfirmBeforeLeavingModal :isDirty="authProviders.isDirtyAny" />
</template>
