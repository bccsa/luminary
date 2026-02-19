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
import _ from "lodash";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const emit = defineEmits(["openMobileSidebar"]);

// Reactive database queries
const groups = useDexieLiveQuery(
    () =>
        db.docs.where({ type: "group" }).toArray() as unknown as Promise<
            GroupDto[]
        >,
    { initialValue: [] as GroupDto[] },
);

// Filter groups to only show those where user has both Edit and Assign permissions
const availableGroups = computed(() => {
    console.log("All Groups:", groups.value);
    const filtered = groups.value.filter((group) => {
        const canEdit = verifyAccess(
            [group._id],
            DocType.Group,
            AclPermission.Edit,
        );
        const canAssign = verifyAccess(
            [group._id],
            DocType.Group,
            AclPermission.Assign,
        );
        console.log(
            `Group ${group.name} (${group._id}): Edit=${canEdit}, Assign=${canAssign}`,
        );
        return canEdit && canAssign;
    });
    console.log("Filtered Available Groups:", filtered);
    return filtered;
});

const providers = useDexieLiveQuery(
    () =>
        db.docs
            .where({ type: "oAuthProvider" })
            .toArray() as unknown as Promise<OAuthProviderDto[]>,
    { initialValue: [] as OAuthProviderDto[] },
);

// Delete permission check
const canDelete = computed(() =>
    hasAnyPermission(DocType.OAuthProvider, AclPermission.Delete),
);
const canEdit = computed(() =>
    hasAnyPermission(DocType.OAuthProvider, AclPermission.Edit),
);

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
// Snapshot of provider at time of opening the edit modal (deep clone)
const existingProvider = ref<OAuthProviderDto | undefined>(undefined);

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
    const c = localCredentials.value;
    return Boolean(
        c.domain.trim() &&
            c.clientId.trim() &&
            c.clientSecret.trim() &&
            c.audience.trim(),
    );
});

// Any non-empty credential field (for dirty checking).
const hasAnyCredentialInput = computed(() => {
    const c = localCredentials.value;
    return !!(
        (c.domain ?? "").trim() ||
        (c.clientId ?? "").trim() ||
        (c.clientSecret ?? "").trim() ||
        (c.audience ?? "").trim()
    );
});

// Dirty checking: provider fields deep-compared against snapshot, credentials checked for any input.
const isDirty = ref(false);
watch(
    [editableProvider, localCredentials],
    () => {
        if (!isEditing.value) {
            isDirty.value = true;
            return;
        }
        if (!existingProvider.value) {
            isDirty.value = false;
            return;
        }

        const providerChanged = !_.isEqual(
            { ...toRaw(editableProvider.value), updatedTimeUtc: 0, _rev: "" },
            { ...toRaw(existingProvider.value), updatedTimeUtc: 0, _rev: "" },
        );

        isDirty.value = providerChanged || hasAnyCredentialInput.value;
    },
    { deep: true, immediate: true },
);

const isFormValid = computed(() => {
    const provider = currentProvider.value;
    if (!provider) return false;

    // Label is required
    if (!(provider.label ?? "").trim()) return false;

    // For new providers, credentials are required
    if (!isEditing.value && !hasValidCredentials.value) return false;

    // When editing, if user entered a new secret they must provide all four credential fields
    if (
        isEditing.value &&
        (localCredentials.value.clientSecret ?? "").trim() !== "" &&
        !hasValidCredentials.value
    ) {
        return false;
    }

    // When editing, require at least one change to enable Update
    if (isEditing.value && !isDirty.value) return false;

    return true;
});

// Centralised modal open/close helpers instead of relying on watcher ordering
function openModal() {
    hasAttemptedSubmit.value = false;

    // Only clientSecret is stored encrypted; domain, clientId, audience are on the doc. Prefill those when editing.
    const p = editableProvider.value;
    localCredentials.value = {
        domain: p?.domain ?? "",
        clientId: p?.clientId ?? "",
        clientSecret: "", // Has to be re-entered to change the secret
        audience: p?.audience ?? "",
    };

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
    openModal();
}

// Expose method for parent to trigger modal
defineExpose({
    openCreateModal,
});

function editProvider(provider: OAuthProviderDto) {
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
            description:
                error instanceof Error
                    ? error.message
                    : "An unknown error occurred",
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

        const provider = isEditing.value
            ? editableProvider.value
            : newProvider.value;
        if (!provider) return;

        // For new providers, credentials are required
        if (!isEditing.value && !hasValidCredentials.value) {
            notification.addNotification({
                title: "Auth0 credentials are required when creating a new provider",
                state: "error",
            });
            return;
        }

        // When editing: if user entered a new secret they must provide all four fields
        if (
            isEditing.value &&
            (localCredentials.value.clientSecret ?? "").trim() !== "" &&
            !hasValidCredentials.value
        ) {
            notification.addNotification({
                title: "Invalid Auth0 credentials",
                description:
                    "Please provide domain, client ID, and audience when changing the client secret.",
                state: "error",
            });
            return;
        }

        // Always sync public fields from form to doc (domain, clientId, audience live on the doc)
        provider.domain = localCredentials.value.domain?.trim() || undefined;
        provider.clientId =
            localCredentials.value.clientId?.trim() || undefined;
        provider.audience =
            localCredentials.value.audience?.trim() || undefined;

        // Only send credential when user provided a new secret (API encrypts clientSecret only)
        if (hasValidCredentials.value) {
            provider.credential = { ...localCredentials.value };
        } else {
            delete provider.credential;
        }

        if (!Array.isArray(provider.memberOf)) {
            provider.memberOf = [];
        } else {
            provider.memberOf = Array.from(provider.memberOf);
        }

        isSavingProvider.value = true;
        savedProviderLabel.value = provider.label;

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
        errors.value = [
            err instanceof Error ? err.message : "Failed to save provider",
        ];
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

        <div
            v-if="isLoading && !providers.length"
            class="px-6 py-8 text-center"
        >
            <div
                class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"
            ></div>
            <p class="mt-2 text-sm text-gray-500">Loading providers...</p>
        </div>

        <div v-else-if="!providers.length" class="px-6 py-8 text-center">
            <h3 class="mt-2 text-sm font-medium text-gray-900">
                No OAuth configured
            </h3>
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
        v-model:provider="currentProvider"
        v-model:localCredentials="localCredentials"
        :isEditing="isEditing"
        :isLoading="isLoading"
        :errors="errors"
        :availableGroups="availableGroups"
        :canDelete="canDelete"
        :isFormValid="isFormValid"
        :hasAttemptedSubmit="hasAttemptedSubmit"
        :hasValidCredentials="hasValidCredentials"
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
