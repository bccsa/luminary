<script setup lang="ts">
import { ref, watch, computed, toRaw } from "vue";
import OAuthProviderDisplayCard from "./OAuthProviderDisplayCard.vue";
import OAuthProviderFormModal from "./OAuthProviderFormModal.vue";
import {
    db,
    DocType,
    type OAuthProviderDto,
    type Auth0CredentialDto,
    useDexieLiveQuery,
    type GroupDto,
    AclPermission,
    verifyAccess,
    hasAnyPermission,
} from "luminary-shared";
import LDialog from "../common/LDialog.vue";
import { useNotificationStore } from "@/stores/notification";
import { changeReqErrors } from "luminary-shared";
import cloneDeep from "lodash.clonedeep";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const emit = defineEmits(["openMobileSidebar"]);

// Reactive database queries
const groups = useDexieLiveQuery(
    () => db.docs.where({ type: "group" }).toArray() as unknown as Promise<GroupDto[]>,
    { initialValue: [] as GroupDto[] },
);

// Filter groups to only show those where user has both Edit and Assign permissions
const availableGroups = computed(() => {
    console.log("All Groups:", groups.value);
    const filtered = groups.value.filter((group) => {
        const canEdit = verifyAccess([group._id], DocType.Group, AclPermission.Edit);
        const canAssign = verifyAccess([group._id], DocType.Group, AclPermission.Assign);
        console.log(`Group ${group.name} (${group._id}): Edit=${canEdit}, Assign=${canAssign}`);
        return canEdit && canAssign;
    });
    console.log("Filtered Available Groups:", filtered);
    return filtered;
});

const providers = useDexieLiveQuery(
    () =>
        db.docs.where({ type: "oAuthProvider" }).toArray() as unknown as Promise<
            OAuthProviderDto[]
        >,
    { initialValue: [] as OAuthProviderDto[] },
);

// Delete permission check
const canDelete = computed(() => hasAnyPermission(DocType.OAuthProvider, AclPermission.Delete));
const canEdit = computed(() => hasAnyPermission(DocType.OAuthProvider, AclPermission.Edit));

const isLoading = ref(false);
const errors = ref<string[] | undefined>(undefined);
const isSavingProvider = ref(false);
const savedProviderLabel = ref<string>("");

const showModal = ref(false);
const showDeleteModal = ref(false);
const providerToDelete = ref<OAuthProviderDto | undefined>(undefined);

const notification = useNotificationStore();

const newProvider = ref<OAuthProviderDto>({
    _id: db.uuid(),
    type: DocType.OAuthProvider,
    updatedTimeUtc: Date.now(),
    memberOf: [],
    label: "",
    providerType: "auth0",
    credential: {
        domain: "",
        clientId: "",
        clientSecret: "",
        audience: "",
    } as Auth0CredentialDto,
});

const editableProvider = ref<OAuthProviderDto | undefined>(undefined);
const isEditing = computed(() => {
    if (!canEdit.value) return false;
    return !!editableProvider.value;
});

const localCredentials = ref<Auth0CredentialDto>({
    domain: "",
    clientId: "",
    clientSecret: "",
    audience: "",
});

// Current provider being edited/created
const currentProvider = computed(() =>
    isEditing.value ? editableProvider.value : newProvider.value,
);

// Validation state
const hasAttemptedSubmit = ref(false);

const hasValidCredentials = computed(() => {
    const c = localCredentials.value;
    return Boolean(
        c.domain.trim() && c.clientId.trim() && c.clientSecret.trim() && c.audience.trim(),
    );
});

const hasPartialCredentials = computed(() => {
    const c = localCredentials.value;
    const hasAny =
        c.domain.trim() || c.clientId.trim() || c.clientSecret.trim() || c.audience.trim();
    return hasAny && !hasValidCredentials.value;
});

const isFormValid = computed(() => {
    const provider = currentProvider.value;
    if (!provider) return false;

    // Label is required
    if (!provider.label.trim()) return false;

    // For new providers, credentials are required
    if (!isEditing.value && !hasValidCredentials.value) return false;

    // For existing providers, if partial credentials are provided, they must be complete
    if (isEditing.value && hasPartialCredentials.value) return false;

    return true;
});

// Watch for modal visibility changes
watch(
    showModal,
    (visible) => {
        if (visible) {
            // Reset form when modal is shown for new provider
            if (!isEditing.value) {
                resetNewProvider();
            }
            hasAttemptedSubmit.value = false;
        } else {
            // Clear error when modal is closed
            errors.value = undefined;
            // Clear editing state when modal is closed
            if (isEditing.value) {
                editableProvider.value = undefined;
            }
            hasAttemptedSubmit.value = false;
        }
    },
    { immediate: false },
);

// Watch for modal opening to populate credentials
watch(showModal, (isOpen) => {
    if (isOpen) {
        const provider = isEditing.value ? editableProvider.value : newProvider.value;
        const c =
            provider?.credential ??
            ({
                domain: "",
                clientId: "",
                clientSecret: "",
                audience: "",
            } as Auth0CredentialDto);
        localCredentials.value = { ...c };
    }
});

// Watch for change request errors
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
            showModal.value = false;
            if (isEditing.value) {
                editableProvider.value = undefined;
            } else {
                resetNewProvider();
            }
            hasAttemptedSubmit.value = false;
        }

        changeReqErrors.value = [];
        isSavingProvider.value = false;
    }
});

// Methods
function resetNewProvider() {
    newProvider.value = {
        _id: db.uuid(),
        type: DocType.OAuthProvider,
        updatedTimeUtc: Date.now(),
        memberOf: [],
        label: "",
        providerType: "auth0",
        credential: {
            domain: "",
            clientId: "",
            clientSecret: "",
            audience: "",
        } as Auth0CredentialDto,
    };
}

function openCreateModal() {
    resetNewProvider();
    editableProvider.value = undefined;
    showModal.value = true;
}

// Expose method for parent to trigger modal
defineExpose({
    openCreateModal,
});

function editProvider(provider: OAuthProviderDto) {
    editableProvider.value = { ...provider };
    showModal.value = true;
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
        providerToDelete.value.memberOf,
        DocType.OAuthProvider,
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
            showModal.value = false;
            editableProvider.value = undefined;
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

        // For new providers, credentials are required
        if (!isEditing.value && !hasValidCredentials.value) {
            notification.addNotification({
                title: "Auth0 credentials are required when creating a new provider",
                state: "error",
            });
            return;
        }

        // For existing providers, if credentials are provided, they must be valid
        if (isEditing.value && hasPartialCredentials.value && !hasValidCredentials.value) {
            notification.addNotification({
                title: "Invalid Auth0 credentials",
                description:
                    "Please provide all credential fields, or leave all empty to keep existing credentials.",
                state: "error",
            });
            return;
        }

        // If credentials valid include them, else remove credential field for edits
        if (hasValidCredentials.value) {
            provider.credential = { ...localCredentials.value };
        } else {
            delete provider.credential;
        }

        // Ensure memberOf is always a valid array
        if (!Array.isArray(provider.memberOf)) {
            provider.memberOf = [];
        } else {
            provider.memberOf = Array.from(provider.memberOf);
        }

        isSavingProvider.value = true;
        savedProviderLabel.value = provider.label;

        // Create a deep clone of the raw object to remove all Vue proxies
        // This prevents DataCloneError when saving to IndexedDB
        const rawProvider = cloneDeep(toRaw(provider));

        await db.upsert({ doc: rawProvider });

        showModal.value = false;

        notification.addNotification({
            title: `Provider ${provider.label} ${isEditing.value ? "updated" : "created"}`,
            description: `Your provider has been successfully ${isEditing.value ? "updated" : "created"}.`,
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
    <div>
        <div class="border-b border-gray-200 py-1.5">
            <div class="px-3 sm:px-0"></div>
        </div>

        <div v-if="isLoading && !providers.length" class="px-6 py-8 text-center">
            <div class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
            <p class="mt-2 text-sm text-gray-500">Loading providers...</p>
        </div>

        <div v-else-if="!providers.length" class="px-6 py-8 text-center">
            <h3 class="mt-2 text-sm font-medium text-gray-900">No OAuth configured</h3>
            <p class="mt-1 text-sm text-gray-500">
                Get started by creating your first OAuth configuration.
            </p>
        </div>

        <div v-else>
            <div class="flex flex-col gap-[3px] overflow-y-auto scrollbar-hide">
                <OAuthProviderDisplayCard
                    v-for="(provider, i) in providers"
                    :key="provider._id || provider.label"
                    :provider="provider"
                    :groups="groups"
                    :class="{
                        'mb-4': i === providers.length - 1,
                    }"
                    @edit="editProvider"
                />
            </div>
        </div>
    </div>

    <!-- Create/Edit Provider Modal -->
    <OAuthProviderFormModal
        v-model:isVisible="showModal"
        :provider="currentProvider"
        :isEditing="isEditing"
        :isLoading="isLoading"
        :errors="errors"
        :availableGroups="availableGroups"
        :canDelete="canDelete"
        :isFormValid="isFormValid"
        :hasAttemptedSubmit="hasAttemptedSubmit"
        :localCredentials="localCredentials"
        :hasValidCredentials="hasValidCredentials"
        @update:provider="
            (value: OAuthProviderDto) =>
                isEditing ? (editableProvider = value) : (newProvider = value)
        "
        @update:localCredentials="(value: Auth0CredentialDto) => (localCredentials = value)"
        @save="saveProvider"
        @delete="deleteProvider"
    />

    <LDialog
        v-model:open="showDeleteModal"
        :title="`Delete Provider ${providerToDelete?.label}?`"
        :description="`Are you sure you want to delete this OAuth provider? This action cannot be undone.`"
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
