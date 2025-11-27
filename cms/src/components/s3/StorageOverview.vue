<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import BucketDisplayCard from "./BucketDisplayCard.vue";
import BucketFormModal from "./StorageFormModal.vue";
import {
    db,
    DocType,
    type StorageDto,
    type S3CredentialDto,
    useDexieLiveQuery,
    type GroupDto,
    AclPermission,
    verifyAccess,
    StorageType,
    useStorageStatus,
    hasAnyPermission,
} from "luminary-shared";
import LDialog from "../common/LDialog.vue";
import { useNotificationStore } from "@/stores/notification";
import { changeReqErrors } from "luminary-shared";
import { storageValidation } from "@/composables/storageValidation";

// Reactive database queries
const groups = useDexieLiveQuery(
    () => db.docs.where({ type: "group" }).toArray() as unknown as Promise<GroupDto[]>,
    { initialValue: [] as GroupDto[] },
);

// Filter groups to only show those where user has both Edit and Assign permissions
const availableGroups = computed(() => {
    return groups.value.filter((group) => {
        return (
            verifyAccess([group._id], DocType.Group, AclPermission.Edit) &&
            verifyAccess([group._id], DocType.Group, AclPermission.Assign)
        );
    });
});

const buckets = useDexieLiveQuery(
    () => db.docs.where({ type: "storage" }).toArray() as unknown as Promise<StorageDto[]>,
    { initialValue: [] as StorageDto[] },
);

// Delete permission check
const canDelete = computed(() => hasAnyPermission(DocType.Storage, AclPermission.Delete));
const canEdit = computed(() => hasAnyPermission(DocType.Storage, AclPermission.Edit));

// Use the shared bucket status composable
const { fetchStorageStatus, refreshAllStatuses, bucketsWithStatus } = useStorageStatus(buckets);

// Ensure statuses are refreshed on mount
onMounted(() => {
    refreshAllStatuses().catch(() => {});
});

const isLoading = ref(false);
const errors = ref<string[] | undefined>(undefined);
const isSavingBucket = ref(false);
const savedBucketName = ref<string>("");

const showModal = ref(false);
const showDeleteModal = ref(false);
const bucketToDelete = ref<StorageDto | undefined>(undefined);

const notification = useNotificationStore();

const newBucket = ref<StorageDto>({
    _id: db.uuid(),
    type: DocType.Storage,
    updatedTimeUtc: Date.now(),
    memberOf: [],
    name: "",
    storageType: StorageType.Image,
    publicUrl: "",
    credential: {
        endpoint: "",
        bucketName: "",
        accessKey: "",
        secretKey: "",
    } as S3CredentialDto,
    mimeTypes: [],
});

const editableBucket = ref<StorageDto | undefined>(undefined);
const isEditing = computed(() => {
    if (!canEdit.value) return false;
    return !!editableBucket.value;
});

const localCredentials = ref<S3CredentialDto>({
    endpoint: "",
    bucketName: "",
    accessKey: "",
    secretKey: "",
});

// Current bucket being edited/created
const currentBucket = computed(() => (isEditing.value ? editableBucket.value : newBucket.value));

// Use the validation composable
const {
    validations,
    isFormValid,
    hasAttemptedSubmit,
    hasValidCredentials,
    hasPartialCredentials,
    hasFieldError,
    touchField,
    resetValidation,
} = storageValidation(currentBucket, localCredentials, isEditing);

// Watch for modal visibility changes
watch(
    showModal,
    (visible) => {
        if (visible) {
            // Reset form when modal is shown for new bucket
            if (!isEditing.value) {
                resetNewBucket();
            }
            resetValidation();
        } else {
            // Clear error when modal is closed
            errors.value = undefined;
            // Clear editing state when modal is closed
            if (isEditing.value) {
                editableBucket.value = undefined;
            }
            resetValidation();
        }
    },
    { immediate: false },
);

// Watch for modal opening to populate credentials
watch(showModal, (isOpen) => {
    if (isOpen) {
        const bucket = isEditing.value ? editableBucket.value : newBucket.value;
        const c =
            bucket?.credential ??
            ({
                endpoint: "",
                bucketName: "",
                accessKey: "",
                secretKey: "",
            } as S3CredentialDto);
        localCredentials.value = { ...c };

        // For existing buckets, credentials are encrypted on the server.
        // Users can enter new credentials here to update them.
    }
});

// Watch for change request errors (e.g., duplicate bucket names, failed bucket creation)
watch(changeReqErrors, (errors) => {
    if (errors && errors.length > 0) {
        // Show error notification for each error
        errors.forEach((error) => {
            notification.addNotification({
                title: "Failed to save bucket",
                description: error,
                state: "error",
            });
        });

        // Close the modal if it's open
        if (showModal.value) {
            showModal.value = false;
            if (isEditing.value) {
                editableBucket.value = undefined;
            } else {
                resetNewBucket();
            }
            hasAttemptedSubmit.value = false;
        }

        // Clear the errors after handling
        changeReqErrors.value = [];
        isSavingBucket.value = false;
    }
});

// Methods
function resetNewBucket() {
    newBucket.value = {
        _id: db.uuid(),
        type: DocType.Storage,
        updatedTimeUtc: Date.now(),
        memberOf: [],
        name: "",
        StorageType: StorageType.Image,
        publicUrl: "",
        credential: {
            endpoint: "",
            bucketName: "",
            accessKey: "",
            secretKey: "",
        } as S3CredentialDto,
        mimeTypes: [],
    };
}

function openCreateModal() {
    resetNewBucket();
    editableBucket.value = undefined;
    showModal.value = true;
}

// Expose method for parent to trigger modal
defineExpose({
    openCreateModal,
});

function editBucket(bucket: StorageDto) {
    editableBucket.value = {
        ...bucket,
        mimeTypes: Array.isArray(bucket.mimeTypes) ? [...bucket.mimeTypes] : [],
    };
    showModal.value = true;
}

function deleteBucket() {
    // Delete the bucket being edited
    if (editableBucket.value) {
        bucketToDelete.value = editableBucket.value;
        showDeleteModal.value = true;
    }
}

async function handleTestConnection(bucket: StorageDto) {
    await fetchStorageStatus(bucket);
}

async function confirmDelete() {
    if (!bucketToDelete.value) return;

    // Check permissions before proceeding
    const canDelete = verifyAccess(
        bucketToDelete.value.memberOf,
        DocType.Storage,
        AclPermission.Delete,
        "all",
    );
    if (!canDelete) {
        notification.addNotification({
            title: "Access denied",
            description: "You do not have permission to delete this bucket",
            state: "error",
        });
        return;
    }

    try {
        // Store bucket name before marking for deletion
        const bucketName = bucketToDelete.value.name;

        // Mark bucket for deletion using the standard pattern
        bucketToDelete.value.deleteReq = 1;

        await db.upsert({ doc: bucketToDelete.value });

        showDeleteModal.value = false;
        bucketToDelete.value = undefined;

        // Close the edit modal if it's open
        if (showModal.value) {
            showModal.value = false;
            editableBucket.value = undefined;
        }

        notification.addNotification({
            title: `Bucket ${bucketName} deleted`,
            description: `The bucket ${bucketName} has been successfully deleted.`,
            state: "success",
        });
    } catch (error) {
        console.error("Error deleting bucket:", error);
        notification.addNotification({
            title: "Failed to delete bucket",
            description: error instanceof Error ? error.message : "An unknown error occurred",
            state: "error",
        });
    }
}

const saveBucket = async () => {
    isLoading.value = true;
    errors.value = undefined;
    hasAttemptedSubmit.value = true; // Mark that user has attempted to submit

    try {
        // Check form validity before proceeding
        if (!isFormValid.value) {
            const invalidValidations = validations.value.filter((v) => !v.isValid);
            errors.value = invalidValidations.map((v) => v.message);
            return;
        }
        const bucket = isEditing.value ? editableBucket.value : newBucket.value;
        if (!bucket) return;

        // For new buckets, credentials are required
        if (!isEditing.value && !hasValidCredentials.value) {
            notification.addNotification({
                title: "S3 credentials are required when creating a new bucket",
                state: "error",
            });
            return; // Don't proceed with save
        }

        // For existing buckets, if credentials are provided, they must be valid
        if (isEditing.value && hasPartialCredentials.value && !hasValidCredentials.value) {
            notification.addNotification({
                title: "Invalid S3 credentials",
                description:
                    "Please provide both access key and secret key, or leave all credential fields empty to keep existing credentials.",
                state: "error",
            });
            return; // Don't proceed with save
        }

        // If credentials valid include them, else remove credential field for edits
        if (hasValidCredentials.value) {
            bucket.credential = { ...localCredentials.value };
        } else {
            // For editing existing buckets, remove credential field if no credentials provided
            // (keeps existing credential_id if present)
            delete bucket.credential;
        }

        // Ensure mimeTypes is always a valid array and create plain array copy
        // This prevents IndexedDB cloning errors with Vue reactive arrays
        if (!Array.isArray(bucket.mimeTypes)) {
            bucket.mimeTypes = [];
        } else {
            bucket.mimeTypes = Array.from(bucket.mimeTypes);
        }

        // Ensure memberOf is always a valid array and create plain array copy
        // This prevents IndexedDB cloning errors with Vue reactive arrays
        if (!Array.isArray(bucket.memberOf)) {
            bucket.memberOf = [];
        } else {
            bucket.memberOf = Array.from(bucket.memberOf);
        }

        // Track that we're saving a bucket
        isSavingBucket.value = true;
        savedBucketName.value = bucket.name;

        // Use toRaw to ensure all reactive proxies are removed before saving
        await db.upsert({ doc: bucket });

        showModal.value = false;

        notification.addNotification({
            title: `Bucket ${bucket.name} ${isEditing.value ? "updated" : "created"}`,
            description: `Your bucket has been successfully ${isEditing.value ? "updated" : "created"}.`,
            state: "success",
        });

        // Success notification will be shown by the changeReqWarnings watcher
        // or error will be shown by changeReqErrors watcher
    } catch (err) {
        console.error("Failed to save bucket:", err);
        errors.value = [err instanceof Error ? err.message : "Failed to save bucket"];
        isSavingBucket.value = false;
    } finally {
        isLoading.value = false;
    }
};
</script>

<template>
    <div>
        <div class="border-b border-gray-200 py-1.5">
            <div class="px-3 sm:px-0">
                <!-- <h2 class="text-lg font-medium text-gray-900">S3 Buckets</h2> -->
            </div>
        </div>

        <div v-if="isLoading && !buckets.length" class="px-6 py-8 text-center">
            <div class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
            <p class="mt-2 text-sm text-gray-500">Loading buckets...</p>
        </div>

        <div v-else-if="!buckets.length" class="px-6 py-8 text-center">
            <h3 class="mt-2 text-sm font-medium text-gray-900">No S3 buckets configured</h3>
            <p class="mt-1 text-sm text-gray-500">
                {{ "Get started by creating your first S3 bucket configuration." }}
            </p>
        </div>

        <div v-else>
            <div class="flex flex-col gap-[3px] overflow-y-auto scrollbar-hide">
                <!-- Add bottom margin to last card so it doesn't overlap with basepage footer -->
                <BucketDisplayCard
                    v-for="(bucket, i) in bucketsWithStatus"
                    :key="bucket._id || bucket.name"
                    :bucket="bucket"
                    :groups="groups"
                    :class="{
                        'mb-4': i === bucketsWithStatus.length - 1,
                    }"
                    @edit="editBucket"
                    @testConnection="handleTestConnection"
                />
            </div>
        </div>
    </div>

    <!-- Create/Edit Bucket Modal -->
    <BucketFormModal
        v-model:isVisible="showModal"
        :bucket="currentBucket"
        :isEditing="isEditing"
        :isLoading="isLoading"
        :errors="errors"
        :availableGroups="availableGroups"
        :canDelete="canDelete"
        :isFormValid="isFormValid"
        :validations="validations"
        :hasAttemptedSubmit="hasAttemptedSubmit"
        :hasFieldError="(fieldId: string) => hasFieldError(fieldId) ?? false"
        :touchField="touchField"
        :localCredentials="localCredentials"
        :hasValidCredentials="hasValidCredentials"
        @update:bucket="(value) => (isEditing ? (editableBucket = value) : (newBucket = value))"
        @update:localCredentials="(value) => (localCredentials = value)"
        @save="saveBucket"
        @delete="deleteBucket"
    />

    <LDialog
        v-model:open="showDeleteModal"
        :title="`Delete Bucket ${bucketToDelete?.name}?`"
        :description="`Are you sure you want to delete this bucket and all its contents? This action cannot be undone.`"
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
