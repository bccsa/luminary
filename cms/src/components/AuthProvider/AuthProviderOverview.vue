<script setup lang="ts">
import { ref, watch, computed, toRaw } from "vue";
import BasePage from "@/components/BasePage.vue";
import AuthProviderDisplayCard from "./AuthProviderDisplayCard.vue";
import AuthProviderFormModal from "./AuthProviderFormModal.vue";
import {
    db,
    DocType,
    type AuthProviderConfigDto,
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

type Props = {
    onOpenMobileSidebar?: () => void;
};

const { onOpenMobileSidebar } = defineProps<Props>();

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

// Read-only live queries — only used for list display and seeding local edit state
const providers = useDexieLiveQuery(
    () =>
        db.docs.where({ type: DocType.AuthProvider }).toArray() as unknown as Promise<
            AuthProviderDto[]
        >,
    { initialValue: [] as AuthProviderDto[] },
);

const configs = useDexieLiveQuery(
    () =>
        db.docs.where({ type: DocType.AuthProviderConfig }).toArray() as unknown as Promise<
            AuthProviderConfigDto[]
        >,
    { initialValue: [] as AuthProviderConfigDto[] },
);

// Plain refs for the item currently open in the modal — no deep watchers, no cloneDeep on keystrokes
const localProvider = ref<AuthProviderDto | undefined>(undefined);
const localConfig = ref<AuthProviderConfigDto | undefined>(undefined);
// Originals — set once when modal opens, used for dirty checking
const originalProvider = ref<AuthProviderDto | undefined>(undefined);
const originalConfig = ref<AuthProviderConfigDto | undefined>(undefined);

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

const newProviderConfig = ref<AuthProviderConfigDto>({
    _id: db.uuid(),
    type: DocType.AuthProviderConfig,
    updatedTimeUtc: Date.now(),
    memberOf: [],
    providerId: newProvider.value._id,
});

// ID of the provider currently being edited (undefined = creating new)
const editingProviderId = ref<string | undefined>(undefined);

const isEditing = computed(() => {
    if (!canEdit.value) return false;
    return !!editingProviderId.value;
});

// Current provider being edited/created (writable computed for v-model binding)
const currentProvider = computed({
    get: () => (isEditing.value ? localProvider.value : newProvider.value),
    set: (value) => {
        if (isEditing.value) localProvider.value = value ?? undefined;
        else newProvider.value = value!;
    },
});

// Current config being edited/created (writable computed for v-model binding)
const currentProviderConfig = computed({
    get: () => (isEditing.value ? localConfig.value : newProviderConfig.value),
    set: (value) => {
        if (isEditing.value) localConfig.value = value ?? undefined;
        else newProviderConfig.value = value!;
    },
});

// Dirty checking — only meaningful when editing; new providers are always saveable
const isDirty = computed(() => {
    if (!isEditing.value) return true;
    return (
        !_.isEqual(
            { ...localProvider.value, updatedTimeUtc: 0 },
            { ...originalProvider.value, updatedTimeUtc: 0 },
        ) ||
        !_.isEqual(
            { ...localConfig.value, updatedTimeUtc: 0 },
            { ...originalConfig.value, updatedTimeUtc: 0 },
        )
    );
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

const isFormValid = computed(() => {
    const provider = currentProvider.value;
    if (!provider) return false;

    if (!(provider.label ?? "").trim()) return false;

    if (!hasValidCredentials.value) return false;

    return true;
});

function openModal() {
    hasAttemptedSubmit.value = false;
    showModal.value = true;
}

function closeModal() {
    showModal.value = false;
    errors.value = undefined;
    editingProviderId.value = undefined;
    localProvider.value = undefined;
    localConfig.value = undefined;
    originalProvider.value = undefined;
    originalConfig.value = undefined;
    hasAttemptedSubmit.value = false;
}

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

function resetNewProvider() {
    const newId = db.uuid();
    newProvider.value = {
        _id: newId,
        type: DocType.AuthProvider,
        updatedTimeUtc: Date.now(),
        memberOf: [],
        label: "",
        domain: "",
        clientId: "",
        audience: "",
    };
    newProviderConfig.value = {
        _id: db.uuid(),
        type: DocType.AuthProviderConfig,
        updatedTimeUtc: Date.now(),
        memberOf: [],
        providerId: newId,
    };
}

function openCreateModal() {
    resetNewProvider();
    editingProviderId.value = undefined;
    openModal();
}

defineExpose({
    openCreateModal,
});

function editProvider(provider: AuthProviderDto) {
    editingProviderId.value = provider._id;
    localProvider.value = _.cloneDeep(toRaw(provider));
    originalProvider.value = _.cloneDeep(toRaw(provider));
    const existingConfig = configs.value.find((c) => c.providerId === provider._id);
    const config = existingConfig
        ? _.cloneDeep(toRaw(existingConfig))
        : ({
              _id: db.uuid(),
              type: DocType.AuthProviderConfig as DocType.AuthProviderConfig,
              updatedTimeUtc: Date.now(),
              memberOf: [...(provider.memberOf ?? [])],
              providerId: provider._id,
          } as AuthProviderConfigDto);
    localConfig.value = config;
    originalConfig.value = _.cloneDeep(config);
    openModal();
}

function deleteProvider() {
    if (localProvider.value) {
        providerToDelete.value = localProvider.value;
        showDeleteModal.value = true;
    }
}

async function confirmDelete() {
    if (!providerToDelete.value) return;

    const canDeleteProvider = verifyAccess(
        providerToDelete.value.memberOf ?? [],
        DocType.AuthProvider,
        AclPermission.Delete,
        "all",
    );
    if (!canDeleteProvider) {
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

        // Also delete the associated config doc if it exists
        const configDoc = configs.value.find((c) => c.providerId === providerToDelete.value!._id);
        if (configDoc) {
            await db.upsert({ doc: { ...configDoc, deleteReq: 1 } });
        }

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

        if (isEditing.value && editingProviderId.value) {
            if (!localProvider.value) return;

            const memberOf = Array.isArray(localProvider.value.memberOf)
                ? Array.from(localProvider.value.memberOf)
                : [];

            isSavingProvider.value = true;
            savedProviderLabel.value = localProvider.value.label ?? "";

            await db.upsert({
                doc: { ...toRaw(localProvider.value), memberOf, updatedTimeUtc: Date.now() },
                overwriteLocalChanges: true,
            });

            // Save config — always upsert to keep memberOf in sync and persist any edits
            if (localConfig.value) {
                await db.upsert({
                    doc: { ...toRaw(localConfig.value), memberOf, updatedTimeUtc: Date.now() },
                    overwriteLocalChanges: true,
                });
            }

            const label = savedProviderLabel.value;
            closeModal();

            notification.addNotification({
                title: `Provider ${label} updated`,
                description: `Your provider has been successfully updated.`,
                state: "success",
            });
        } else {
            const provider = _.cloneDeep(toRaw(newProvider.value));
            const config = _.cloneDeep(toRaw(newProviderConfig.value));

            if (!Array.isArray(provider.memberOf)) {
                provider.memberOf = [];
            } else {
                provider.memberOf = Array.from(provider.memberOf);
            }

            // Keep memberOf in sync between both documents
            config.memberOf = Array.from(provider.memberOf);

            isSavingProvider.value = true;
            savedProviderLabel.value = provider.label ?? "";

            await db.upsert({ doc: provider });
            await db.upsert({ doc: config });

            closeModal();

            notification.addNotification({
                title: `Provider ${provider.label} created`,
                description: `Your provider has been successfully created.`,
                state: "success",
            });
        }
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
    <BasePage
        :is-full-width="true"
        title="Auth providers overview"
        :should-show-page-title="false"
        :onOpenMobileSidebar="onOpenMobileSidebar"
    >
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
</template>
