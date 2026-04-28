<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import DisplayCard from "./DisplayCard.vue";
import FormModal from "./FormModal.vue";
import LDialog from "../common/LDialog.vue";
import LButton from "@/components/button/LButton.vue";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import {
    PlusIcon,
    MagnifyingGlassIcon,
    UserGroupIcon,
    ArrowUturnLeftIcon,
    AdjustmentsVerticalIcon,
} from "@heroicons/vue/24/outline";
import LInput from "../forms/LInput.vue";
import LCombobox from "../forms/LCombobox.vue";
import LModal from "../modals/LModal.vue";
import LTag from "../content/LTag.vue";
import LoadingBar from "@/components/LoadingBar.vue";
import { isSmallScreen } from "@/globalConfig";
import { useAuthProviders } from "@/composables/useAuthProviders";
import { computed, ref, useTemplateRef } from "vue";

type Props = {
    onOpenMobileSidebar?: () => void;
};

const { onOpenMobileSidebar } = defineProps<Props>();

const {
    groups,
    availableGroups,
    providers,
    isLoadingProviders,
    canDelete,
    canEdit,
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
} = useAuthProviders();

// Provider edit-state (editable ≠ shadow) for the currently edited provider.
// FormModal combines this with its local staging-diff to derive isDirty.
const currentProviderIsEdited = computed(() => isProviderEdited(editingProviderId.value));

// Imperative handle for FormModal's duplicate handoff — see prepareForDuplicate
// in FormModal.vue for why this dance is needed.
const formModalRef = useTemplateRef<{ prepareForDuplicate: () => void }>("formModalRef");

const hasAttemptedSubmit = ref(false);

async function handleSave() {
    await saveProvider();
}

function handleDuplicate() {
    formModalRef.value?.prepareForDuplicate();
    duplicateProvider();
}

// ── Filter state ────────────────────────────────────────────────────────────

const searchQuery = ref("");
const selectedGroupFilter = ref<string[]>([]);
const showMobileFilters = ref(false);

const groupFilterOptions = computed(() =>
    groups.value.map((g: any) => ({
        id: g._id,
        label: g.name,
        value: g._id,
    })),
);

const filteredProviders = computed(() => {
    let result = providers.value;
    if (selectedGroupFilter.value.length > 0) {
        result = result.filter((p) =>
            (p.memberOf ?? []).some((gid: string) => selectedGroupFilter.value.includes(gid)),
        );
    }
    const q = searchQuery.value.trim().toLowerCase();
    if (q) {
        result = result.filter(
            (p) =>
                (p.label ?? "").toLowerCase().includes(q) ||
                (p.domain ?? "").toLowerCase().includes(q),
        );
    }
    return result;
});

function resetFilters() {
    searchQuery.value = "";
    selectedGroupFilter.value = [];
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

        <template #internalPageHeader>
            <!-- Desktop filter bar -->
            <div
                v-if="!isSmallScreen"
                class="flex flex-col gap-1 overflow-visible border-b border-t border-zinc-300 border-t-zinc-100 bg-white pb-1 pt-2 shadow"
            >
                <div class="flex h-10 w-full items-center gap-1 px-8">
                    <LInput
                        type="text"
                        :icon="MagnifyingGlassIcon"
                        class="h-full flex-grow"
                        name="search"
                        placeholder="Search..."
                        v-model="searchQuery"
                        :full-height="true"
                    />
                    <div class="relative flex h-full items-center gap-1">
                        <LCombobox
                            :options="groupFilterOptions"
                            v-model:selected-options="selectedGroupFilter"
                            :show-selected-in-dropdown="false"
                            :showSelectedLabels="false"
                            :icon="UserGroupIcon"
                        />
                        <LButton @click="resetFilters" class="h-full w-10">
                            <ArrowUturnLeftIcon class="h-4 w-4" />
                        </LButton>
                    </div>
                </div>

                <!-- Selected group filter tags -->
                <div v-if="selectedGroupFilter.length > 0" class="ml-8 flex w-full flex-col gap-1">
                    <ul class="flex w-full flex-wrap gap-2">
                        <LTag
                            :icon="UserGroupIcon"
                            v-for="groupId in selectedGroupFilter"
                            :key="groupId"
                            @remove="() => { selectedGroupFilter = selectedGroupFilter.filter((v) => v !== groupId); }"
                        >
                            {{ groups.find((g: any) => g._id === groupId)?.name }}
                        </LTag>
                    </ul>
                </div>
            </div>

            <!-- Mobile filter bar -->
            <div
                v-else
                class="z-20 flex flex-col gap-1 overflow-visible border-b border-t border-zinc-300 border-t-zinc-100 bg-white pb-1 pt-2 shadow max-sm:px-1 sm:px-4"
            >
                <div class="flex gap-1">
                    <LInput
                        type="text"
                        :icon="MagnifyingGlassIcon"
                        class="flex-grow"
                        name="search"
                        placeholder="Search..."
                        v-model="searchQuery"
                        :full-height="true"
                    />
                    <LButton :icon="AdjustmentsVerticalIcon" @click="showMobileFilters = true" />
                    <LButton :icon="ArrowUturnLeftIcon" @click="resetFilters" />
                </div>

                <!-- Selected group filter tags (mobile) -->
                <div v-if="selectedGroupFilter.length > 0" class="flex w-full flex-col gap-1">
                    <ul class="flex w-full flex-wrap gap-2">
                        <LTag
                            :icon="UserGroupIcon"
                            v-for="groupId in selectedGroupFilter"
                            :key="groupId"
                            @remove="() => { selectedGroupFilter = selectedGroupFilter.filter((v) => v !== groupId); }"
                        >
                            {{ groups.find((g: any) => g._id === groupId)?.name }}
                        </LTag>
                    </ul>
                </div>
            </div>

            <!-- Mobile filter modal -->
            <LModal heading="Filter options" v-model:is-visible="showMobileFilters">
                <div class="flex flex-col gap-2">
                    <LCombobox
                        label="Group Membership"
                        :options="groupFilterOptions"
                        v-model:selected-options="selectedGroupFilter"
                        :show-selected-in-dropdown="false"
                        :showSelectedLabels="false"
                        :icon="UserGroupIcon"
                    />
                </div>
                <template #footer>
                    <LButton variant="primary" class="mt-2 w-full" @click="showMobileFilters = false">
                        Close
                    </LButton>
                </template>
            </LModal>
        </template>

        <div class="mt-1">
            <div v-if="isLoadingProviders && !providers.length" class="px-6 py-8">
                <LoadingBar />
            </div>

            <div v-else-if="!filteredProviders.length && !providers.length" class="px-6 py-8 text-center">
                <h3 class="mt-2 text-sm font-medium text-gray-900">No auth provider configured</h3>
                <p class="mt-1 text-sm text-gray-500">
                    Get started by creating your first OIDC auth provider.
                </p>
            </div>

            <div v-else-if="!filteredProviders.length" class="px-6 py-8 text-center">
                <p class="text-sm italic text-gray-400">No providers match the current filters.</p>
            </div>

            <div v-else class="flex flex-col gap-[3px]">
                <DisplayCard
                    v-for="(provider, i) in filteredProviders"
                    :key="provider._id || provider.label"
                    :provider="provider"
                    :groups="groups"
                    :isModified="providerIsModified(provider._id)"
                    :class="{ 'mb-4': i === filteredProviders.length - 1 }"
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
        :canEdit="canEdit"
        :canDelete="canDelete"
        :providerIsEdited="currentProviderIsEdited"
        @save="handleSave"
        @delete="deleteProvider"
        @duplicate="handleDuplicate"
        @revert="revertProvider"
    />

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
