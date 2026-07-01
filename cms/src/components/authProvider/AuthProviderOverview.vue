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
const showMobileFilters = ref(false);

const groupFilterOptions = computed(() =>
    authProviders.groups.map((g: any) => ({
        id: g._id,
        label: g.name,
        value: g._id,
    })),
);

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

function resetFilters() {
    searchQuery.value = "";
    selectedGroupFilter.value = [];
}

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
    >
        <template #topBarActionsDesktop>
            <LButton
                v-if="authProviders.canEdit && !isSmallScreen"
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
                v-if="authProviders.canEdit && isSmallScreen"
                class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                @click="authProviders.openCreateModal"
            />
        </template>

        <template #internalPageHeader>
            <!-- Desktop filter bar -->
            <div
                v-if="!isSmallScreen"
                class="flex flex-col gap-1 overflow-visible"
            >
                <div class="flex h-10 w-full items-center gap-1">
                    <LInput
                        type="text"
                        :icon="MagnifyingGlassIcon"
                        class="h-full min-w-0 flex-grow"
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
                <div v-if="selectedGroupFilter.length > 0" class="flex w-full flex-col gap-1">
                    <ul class="flex w-full flex-wrap gap-2">
                        <LTag
                            :icon="UserGroupIcon"
                            v-for="groupId in selectedGroupFilter"
                            :key="groupId"
                            @remove="() => { selectedGroupFilter = selectedGroupFilter.filter((v) => v !== groupId); }"
                        >
                            {{ authProviders.groups.find((g: any) => g._id === groupId)?.name }}
                        </LTag>
                    </ul>
                </div>
            </div>

            <!-- Mobile filter bar -->
            <div
                v-else
                class="z-20 flex flex-col gap-1 overflow-visible"
            >
                <div class="flex h-10 w-full items-center gap-1">
                    <LInput
                        type="text"
                        :icon="MagnifyingGlassIcon"
                        class="h-full min-w-0 flex-grow"
                        name="search"
                        placeholder="Search..."
                        v-model="searchQuery"
                        :full-height="true"
                    />
                    <LButton class="h-full" :icon="AdjustmentsVerticalIcon" @click="showMobileFilters = true" />
                    <LButton class="h-full w-10" :icon="ArrowUturnLeftIcon" @click="resetFilters" />
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
                            {{ authProviders.groups.find((g: any) => g._id === groupId)?.name }}
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

        <div class="mt-1 flex flex-col gap-[3px]">
            <div
                v-if="authProviders.isLoadingProviders && !authProviders.providers.length"
                class="flex items-center justify-center py-12"
            >
                <LoadingBar />
            </div>

            <EmptyState
                v-else-if="!filteredProviders.length && !authProviders.providers.length"
                title="No auth provider configured"
                description="Get started by creating your first OIDC auth provider."
                :button-text="authProviders.canEdit ? 'Create provider' : undefined"
                :button-action="authProviders.canEdit ? authProviders.openCreateModal : undefined"
                :button-permission="authProviders.canEdit"
            />

            <EmptyState
                v-else-if="!filteredProviders.length"
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
