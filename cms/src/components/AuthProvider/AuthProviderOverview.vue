<script setup lang="ts">
import { ref, watch, computed, toRaw } from "vue";
import BasePage from "@/components/BasePage.vue";
import AuthProviderDisplayCard from "./AuthProviderDisplayCard.vue";
import AuthProviderFormModal from "./AuthProviderFormModal.vue";
import {
    db,
    DocType,
    type AuthProviderDto,
    type GlobalConfigDto,
    useDexieLiveQuery,
    type GroupDto,
    AclPermission,
    verifyAccess,
    hasAnyPermission,
} from "luminary-shared";
import LDialog from "../common/LDialog.vue";
import LButton from "@/components/button/LButton.vue";
import LCombobox, { type ComboboxOption } from "@/components/forms/LCombobox.vue";
import { useNotificationStore } from "@/stores/notification";
import { changeReqErrors } from "luminary-shared";
import _ from "lodash";
import { PlusIcon, GlobeAltIcon } from "@heroicons/vue/24/outline";
import { isSmallScreen } from "@/globalConfig";

// Reactive database queries
const groups = useDexieLiveQuery(
    () => db.docs.where({ type: "group" }).toArray() as unknown as Promise<GroupDto[]>,
    { initialValue: [] as GroupDto[] },
);

// Filter groups to only show those where user has both Edit and Assign permissions
const availableGroups = computed(() => {
    return groups.value.filter((group) => {
        const canEdit = verifyAccess([group._id], DocType.Group, AclPermission.Edit);
        const canAssign = verifyAccess([group._id], DocType.Group, AclPermission.Assign);
        return canEdit && canAssign;
    });
});

const providers = useDexieLiveQuery(
    () =>
        db.docs.where({ type: DocType.AuthProvider }).toArray() as unknown as Promise<
            AuthProviderDto[]
        >,
    { initialValue: [] as AuthProviderDto[] },
);

// Delete permission check
const canDelete = computed(() => hasAnyPermission(DocType.AuthProvider, AclPermission.Delete));
const canEdit = computed(() => hasAnyPermission(DocType.AuthProvider, AclPermission.Edit));

// GlobalConfig — default groups
const globalConfig = useDexieLiveQuery(
    () =>
        db.docs.where({ type: DocType.GlobalConfig }).first() as unknown as Promise<
            GlobalConfigDto | undefined
        >,
    { initialValue: undefined as GlobalConfigDto | undefined },
);
const canEditGlobalConfig = computed(() =>
    hasAnyPermission(DocType.GlobalConfig, AclPermission.Edit),
);
const editableDefaultGroups = ref<string[]>([]);
watch(
    globalConfig,
    (cfg) => {
        if (cfg) editableDefaultGroups.value = [...(cfg.defaultGroups ?? [])];
    },
    { immediate: true },
);
const isDefaultGroupsDirty = computed(
    () =>
        !_.isEqual(
            [...editableDefaultGroups.value].sort(),
            [...(globalConfig.value?.defaultGroups ?? [])].sort(),
        ),
);

const defaultGroupOptions = computed<ComboboxOption[]>(() =>
    groups.value
        .filter(
            (g) =>
                verifyAccess([g._id], DocType.Group, AclPermission.Edit) &&
                verifyAccess([g._id], DocType.Group, AclPermission.Assign),
        )
        .map((g) => ({ id: g._id, label: g.name, value: g._id })),
);

const defaultGroupSelectedLabels = computed<ComboboxOption[]>(() =>
    editableDefaultGroups.value.map((groupId) => {
        const group = groups.value.find((g) => g._id === groupId);
        const canAssign =
            !!group &&
            verifyAccess([group._id], DocType.Group, AclPermission.Assign) &&
            verifyAccess([group._id], DocType.Group, AclPermission.Edit);
        return {
            id: groupId,
            label: group?.name ?? groupId,
            value: groupId,
            isVisible: !!group,
            isRemovable: canAssign,
        };
    }),
);
const showDefaultGroupsDialog = ref(false);
const isSavingDefaultGroups = ref(false);

function openDefaultGroupsDialog() {
    // Reset editable copy to current saved state
    editableDefaultGroups.value = [...(globalConfig.value?.defaultGroups ?? [])];
    showDefaultGroupsDialog.value = true;
}

async function saveDefaultGroups() {
    if (!globalConfig.value) return;
    isSavingDefaultGroups.value = true;
    try {
        const doc = {
            ...toRaw(globalConfig.value),
            defaultGroups: [...editableDefaultGroups.value],
            updatedTimeUtc: Date.now(),
        };
        await db.upsert({ doc });
        showDefaultGroupsDialog.value = false;
        notification.addNotification({
            title: "Default groups saved",
            description: "The default groups have been successfully updated.",
            state: "success",
        });
    } catch (err) {
        notification.addNotification({
            title: "Failed to save default groups",
            description: err instanceof Error ? err.message : "An unknown error occurred",
            state: "error",
        });
    } finally {
        isSavingDefaultGroups.value = false;
    }
}

const isLoading = ref(false);
const errors = ref<string[] | undefined>(undefined);
const isSavingProvider = ref(false);
const savedProviderLabel = ref<string>("");

const showModal = ref(false);
const showDeleteModal = ref(false);
const providerToDelete = ref<AuthProviderDto | undefined>(undefined);

const notification = useNotificationStore();

const newProvider = ref<AuthProviderDto>({
    _id: db.uuid(),
    type: DocType.AuthProvider,
    updatedTimeUtc: Date.now(),
    memberOf: [],
    label: "",
    domain: "",
    clientId: "",
    audience: "",
});

const editableProvider = ref<AuthProviderDto | undefined>(undefined);
// Snapshot of provider at time of opening the edit modal (deep clone)
const existingProvider = ref<AuthProviderDto | undefined>(undefined);

const isEditing = computed(() => {
    if (!canEdit.value) return false;
    return !!editableProvider.value;
});

// Current provider being edited/created (writable computed for v-model binding)
const currentProvider = computed({
    get: () => (isEditing.value ? editableProvider.value : newProvider.value),
    set: (value) => {
        if (isEditing.value) editableProvider.value = value;
        else newProvider.value = value!;
    },
});

// Validation state
const hasAttemptedSubmit = ref(false);

const hasValidCredentials = computed(() => {
    const p = currentProvider.value;
    if (!p) return false;
    return Boolean(
        (p.domain || "").trim() && (p.clientId || "").trim() && (p.audience || "").trim(),
    );
});

// Dirty checking: provider fields deep-compared against snapshot
const isDirty = ref(false);
watch(
    [editableProvider, currentProvider],
    () => {
        if (!isEditing.value) {
            isDirty.value = true;
            return;
        }
        if (!existingProvider.value || !currentProvider.value) {
            isDirty.value = false;
            return;
        }

        const providerChanged = !_.isEqual(
            { ...toRaw(currentProvider.value), updatedTimeUtc: 0, _rev: "" },
            { ...toRaw(existingProvider.value), updatedTimeUtc: 0, _rev: "" },
        );

        isDirty.value = providerChanged;
    },
    { deep: true, immediate: true },
);

const isFormValid = computed(() => {
    const provider = currentProvider.value;
    if (!provider) return false;

    // Label is required
    if (!(provider.label ?? "").trim()) return false;

    // Credentials are required for all providers
    if (!hasValidCredentials.value) return false;

    // When editing, require at least one change to enable Update
    if (isEditing.value && !isDirty.value) return false;

    return true;
});

// Centralised modal open/close helpers instead of relying on watcher ordering
function openModal() {
    hasAttemptedSubmit.value = false;

    // Capture clean snapshot for dirty checking when editing
    if (editableProvider.value) {
        existingProvider.value = _.cloneDeep(toRaw(editableProvider.value));
    }

    showModal.value = true;
}

function closeModal() {
    showModal.value = false;
    errors.value = undefined;
    editableProvider.value = undefined;
    existingProvider.value = undefined;
    hasAttemptedSubmit.value = false;
}

// Ensure state is cleaned up if the modal is closed externally (e.g. backdrop click)
watch(showModal, (visible) => {
    if (!visible) {
        closeModal();
    }
});

watch(changeReqErrors, (errors) => {
    if (errors && errors.length > 0) {
        errors.forEach((error) => {
            notification.addNotification({
                title: "Failed to save provider",
                description: error,
                state: "error",
            });
        });

        if (showModal.value) {
            closeModal();
        }

        changeReqErrors.value = [];
        isSavingProvider.value = false;
    }
});

// Methods
function resetNewProvider() {
    newProvider.value = {
        _id: db.uuid(),
        type: DocType.AuthProvider,
        updatedTimeUtc: Date.now(),
        memberOf: [],
        label: "",
        domain: "",
        clientId: "",
        audience: "",
    };
}

function openCreateModal() {
    resetNewProvider();
    editableProvider.value = undefined;
    openModal();
}

// Expose method for parent to trigger modal
defineExpose({
    openCreateModal,
});

function editProvider(provider: AuthProviderDto) {
    editableProvider.value = _.cloneDeep(provider);
    openModal();
}

function deleteProvider() {
    if (editableProvider.value) {
        providerToDelete.value = editableProvider.value;
        showDeleteModal.value = true;
    }
}

async function confirmDelete() {
    if (!providerToDelete.value) return;

    const canDelete = verifyAccess(
        providerToDelete.value.memberOf ?? [],
        DocType.AuthProvider,
        AclPermission.Delete,
        "all",
    );
    if (!canDelete) {
        notification.addNotification({
            title: "Access denied",
            description: "You do not have permission to delete this provider",
            state: "error",
        });
        return;
    }

    try {
        const providerLabel = providerToDelete.value.label;

        providerToDelete.value.deleteReq = 1;

        await db.upsert({ doc: providerToDelete.value });

        showDeleteModal.value = false;
        providerToDelete.value = undefined;

        if (showModal.value) {
            closeModal();
        }

        notification.addNotification({
            title: `Provider ${providerLabel} deleted`,
            description: `The provider has been successfully deleted.`,
            state: "success",
        });
    } catch (error) {
        console.error("Error deleting provider:", error);
        notification.addNotification({
            title: "Failed to delete provider",
            description: error instanceof Error ? error.message : "An unknown error occurred",
            state: "error",
        });
    }
}

const saveProvider = async () => {
    isLoading.value = true;
    errors.value = undefined;
    hasAttemptedSubmit.value = true;

    try {
        if (!isFormValid.value) {
            errors.value = ["Please fill in all required fields"];
            return;
        }

        const provider = isEditing.value ? editableProvider.value : newProvider.value;
        if (!provider) return;

        if (!Array.isArray(provider.memberOf)) {
            provider.memberOf = [];
        } else {
            provider.memberOf = Array.from(provider.memberOf);
        }

        isSavingProvider.value = true;
        savedProviderLabel.value = provider.label ?? "";

        const rawProvider = _.cloneDeep(toRaw(provider));

        await db.upsert({ doc: rawProvider });

        const wasEditing = isEditing.value;
        closeModal();

        notification.addNotification({
            title: `Provider ${provider.label} ${wasEditing ? "updated" : "created"}`,
            description: `Your provider has been successfully ${wasEditing ? "updated" : "created"}.`,
            state: "success",
        });
    } catch (err) {
        console.error("Failed to save provider:", err);
        errors.value = [err instanceof Error ? err.message : "Failed to save provider"];
        isSavingProvider.value = false;
    } finally {
        isLoading.value = false;
    }
};
</script>

<template>
    <BasePage :is-full-width="true" title="Auth providers overview" :should-show-page-title="false">
        <template #pageNav>
            <div class="flex items-center gap-2">
                <GlobeAltIcon
                    v-if="canEditGlobalConfig && globalConfig && isSmallScreen"
                    class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                    data-test="global-group-access"
                    @click="openDefaultGroupsDialog"
                />
                <LButton
                    v-if="canEditGlobalConfig && globalConfig && !isSmallScreen"
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
            <div v-if="isLoading && !providers.length" class="px-6 py-8 text-center">
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
        :isEditing="isEditing"
        :isLoading="isLoading"
        :errors="errors"
        :availableGroups="availableGroups"
        :canDelete="canDelete"
        :isFormValid="isFormValid"
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
</template>
