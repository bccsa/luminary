<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import { PlusIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import BucketDisplayCard from "./BucketDisplayCard.vue";
import {
    db,
    DocType,
    type StorageDto,
    type S3CredentialDto,
    useDexieLiveQuery,
    type GroupDto,
    AclPermission,
    verifyAccess,
    BucketType,
    useBucketStatus,
    hasAnyPermission,
} from "luminary-shared";
import LModal from "../modals/LModal.vue";
import LInput from "../forms/LInput.vue";
import LCombobox from "../forms/LCombobox.vue";
import LDialog from "../common/LDialog.vue";
import { useNotificationStore } from "@/stores/notification";
import { XCircleIcon } from "@heroicons/vue/20/solid";
import { changeReqErrors } from "luminary-shared";
import { changeReqWarnings } from "luminary-shared";
import LSelect from "../forms/LSelect.vue";
import { capitaliseFirstLetter } from "@/util/string";

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
const { fetchBucketStatus, refreshAllStatuses, bucketsWithStatus } = useBucketStatus(buckets);

// Ensure statuses are refreshed on mount
onMounted(() => {
    refreshAllStatuses().catch(() => {});
});

const isLoading = ref(false);
const errors = ref<string[] | null>(null);
const isSavingBucket = ref(false);
const savedBucketName = ref<string>("");

// Validation system following EditContentValidation pattern
type Validation = {
    id: string;
    isValid: boolean;
    message: string;
};

function validate<T>(
    message: string,
    id: string,
    validationsList: Validation[],
    value: T,
    callback: (val: T) => boolean,
) {
    const validation = validationsList.find((v) => v.id == id);
    if (!validation) {
        validationsList.push({ id, isValid: callback(value), message });
        return;
    }
    validation.isValid = callback(value);
}

const validations = ref([] as Validation[]);
const isFormValid = ref(true);
const hasAttemptedSubmit = ref(false); // Track if user has tried to submit

const showModal = ref(false);
const showCredentials = ref(false);
const showDeleteModal = ref(false);
const bucketToDelete = ref<StorageDto | null>(null);
const newFileType = ref<string>("");

const notification = useNotificationStore();

const newBucket = ref<StorageDto>({
    _id: db.uuid(),
    type: DocType.Storage,
    updatedTimeUtc: Date.now(),
    memberOf: [],
    name: "",
    bucketType: BucketType.Image,
    publicUrl: "",
    credential: {
        endpoint: "",
        bucketName: "",
        accessKey: "",
        secretKey: "",
    } as S3CredentialDto,
    mimeTypes: [],
});

const editableBucket = ref<StorageDto | null>(null);
const isEditing = computed(() => {
    if (!canEdit.value) return false;
    return !!editableBucket.value;
});

// Determine if we should show credentials section
const shouldShowCredentialsSection = computed(() => {
    // Always show for new buckets
    if (!isEditing.value) {
        return true;
    }

    // For existing buckets, always show credentials section to allow updates
    return true;
});

// Watch for modal visibility changes
watch(
    showModal,
    (visible) => {
        if (visible) {
            // Reset form when modal is shown for new bucket
            if (!isEditing.value) {
                resetNewBucket();
            }
            showCredentials.value = false;
            hasAttemptedSubmit.value = false; // Reset submission attempt
            touchedFields.value.clear(); // Clear touched fields
        } else {
            // Clear error when modal is closed
            errors.value = null;
            // Clear editing state when modal is closed
            if (isEditing.value) {
                editableBucket.value = null;
            }
            hasAttemptedSubmit.value = false; // Reset on close too
            touchedFields.value.clear(); // Clear touched fields
        }
    },
    { immediate: false },
);

const localCredentials = ref<S3CredentialDto>({
    endpoint: "",
    bucketName: "",
    accessKey: "",
    secretKey: "",
});

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
                editableBucket.value = null;
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

// Watch for successful bucket save (with optional warnings)
watch(changeReqWarnings, (warnings) => {
    if (warnings && warnings.length > 0 && isSavingBucket.value) {
        // Show success notification
        notification.addNotification({
            title: `Bucket ${savedBucketName.value} ${isEditing.value ? "updated" : "created"}`,
            description: warnings.join("; "),
            state: "success",
        });

        // Close modal and reset
        showModal.value = false;
        if (isEditing.value) {
            editableBucket.value = null;
        } else {
            resetNewBucket();
        }
        hasAttemptedSubmit.value = false;
        isSavingBucket.value = false;

        // Clear warnings
        changeReqWarnings.value = [];
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
        bucketType: BucketType.Image,
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
    editableBucket.value = null;
    showModal.value = true;
}

// Expose method for parent to trigger modal
defineExpose({
    openCreateModal,
});

function addFileType() {
    const fileType = newFileType.value.trim();
    const bucket = isEditing.value ? editableBucket.value : newBucket.value;

    if (fileType && bucket && !bucket.mimeTypes.includes(fileType)) {
        bucket.mimeTypes.push(fileType);
        newFileType.value = "";
    }
}

const availableBucketType = Object.values(BucketType);

function removeFileType(fileType: string) {
    const bucket = isEditing.value ? editableBucket.value : newBucket.value;
    if (!bucket) return;

    const index = bucket.mimeTypes.indexOf(fileType);
    if (index > -1) {
        bucket.mimeTypes.splice(index, 1);
    }
}

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
    await fetchBucketStatus(bucket);
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
        bucketToDelete.value = null;

        // Close the edit modal if it's open
        if (showModal.value) {
            showModal.value = false;
            editableBucket.value = null;
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

const endpointProvided = computed(() => !!localCredentials.value.endpoint?.trim());
const bucketNameProvided = computed(() => !!localCredentials.value.bucketName?.trim());
const accessKeyProvided = computed(() => !!localCredentials.value.accessKey?.trim());
const secretKeyProvided = computed(() => !!localCredentials.value.secretKey?.trim());

// Computed to check if all credential fields are provided
const hasCompleteCredentials = computed(
    () =>
        endpointProvided.value &&
        bucketNameProvided.value &&
        accessKeyProvided.value &&
        secretKeyProvided.value,
);

// Computed to check if any credential fields are provided
const hasPartialCredentials = computed(
    () =>
        endpointProvided.value ||
        bucketNameProvided.value ||
        accessKeyProvided.value ||
        secretKeyProvided.value,
);

// Computed to determine if credentials are valid (all or none)
const hasValidCredentials = computed(() => {
    if (!hasPartialCredentials.value) return false; // No credentials provided
    return hasCompleteCredentials.value; // All credentials must be provided if any are provided
});

// Real-time validation watcher
watch(
    [() => (isEditing.value ? editableBucket.value : newBucket.value), localCredentials, isEditing],
    () => {
        const bucket = isEditing.value ? editableBucket.value : newBucket.value;
        if (!bucket) return;

        // Clear previous validations
        validations.value = [];

        // Validate bucket name
        validate(
            "Bucket name is required",
            "bucketName",
            validations.value,
            bucket,
            (b) => !!b.name?.trim(),
        );

        // Validate bucket name format
        validate(
            "Bucket name: 3-63 chars, alphanumeric characters, spaces, hyphens, and periods allowed",
            "bucketNameFormat",
            validations.value,
            bucket,
            (b) => {
                const name = b.name?.trim();
                if (!name) return true; // Skip if empty (handled by required validation)

                // Length check
                if (name.length < 3 || name.length > 63) return false;

                // Allow alphanumeric, spaces, hyphens, and periods
                if (!/^[a-zA-Z0-9.\s-]+$/.test(name)) return false;

                return true;
            },
        );

        // Validate Public URL
        validate(
            "Public URL is required",
            "publicUrl",
            validations.value,
            bucket,
            (b) => !!b.publicUrl?.trim(),
        );

        // Validate Public URL format (must start with http:// or https://)
        validate(
            "Public URL must start with http:// or https://",
            "publicUrlFormat",
            validations.value,
            bucket,
            (b) => {
                const path = b.publicUrl?.trim();
                if (!path) return true; // Skip if empty (handled by required validation)
                return path.startsWith("http://") || path.startsWith("https://");
            },
        );

        // Validate credentials for new buckets
        if (!isEditing.value) {
            validate(
                "S3 credentials are required when creating a new bucket",
                "credentialsRequired",
                validations.value,
                bucket,
                () => hasValidCredentials.value,
            );
        }

        // Validate credential completeness if any are provided
        if (hasPartialCredentials.value) {
            validate(
                "S3 endpoint is required when providing credentials",
                "endpoint",
                validations.value,
                localCredentials.value,
                () => endpointProvided.value,
            );

            // Validate endpoint format (must start with http:// or https://)
            validate(
                "Endpoint must start with http:// or https://",
                "endpointFormat",
                validations.value,
                localCredentials.value,
                (c) => {
                    const endpoint = c.endpoint?.trim();
                    if (!endpoint) return true; // Skip if empty (handled by required validation)
                    return endpoint.startsWith("http://") || endpoint.startsWith("https://");
                },
            );

            validate(
                "Bucket name is required when providing credentials",
                "bucketName",
                validations.value,
                localCredentials.value,
                () => bucketNameProvided.value,
            );

            validate(
                "Access key is required when providing credentials",
                "accessKey",
                validations.value,
                localCredentials.value,
                () => accessKeyProvided.value,
            );

            validate(
                "Secret key is required when providing credentials",
                "secretKey",
                validations.value,
                localCredentials.value,
                () => secretKeyProvided.value,
            );
        }

        // Update form validity
        isFormValid.value = validations.value.every((v) => v.isValid);
    },
    { immediate: true, deep: true },
);

// Helper function to get validation error for a specific field
const getFieldValidation = (fieldId: string) => {
    return validations.value.find((v) => v.id === fieldId);
};

// Track which fields have been touched (interacted with)
const touchedFields = ref<Set<string>>(new Set());

// Helper function to mark a field as touched
const touchField = (fieldId: string) => {
    touchedFields.value.add(fieldId);
};

// Helper function to check if a field has an error and should show it
const hasFieldError = (fieldId: string) => {
    const validation = getFieldValidation(fieldId);
    // Show error if field has been touched OR form has been submitted
    const shouldShow = touchedFields.value.has(fieldId) || hasAttemptedSubmit.value;
    return shouldShow && validation && !validation.isValid;
};

const saveBucket = async () => {
    isLoading.value = true;
    errors.value = null;
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

        // Ensure mimeTypes is always a valid array
        if (!Array.isArray(bucket.mimeTypes)) {
            bucket.mimeTypes = [];
        }

        // Track that we're saving a bucket
        isSavingBucket.value = true;
        savedBucketName.value = bucket.name;

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
    <LModal
        v-model:isVisible="showModal"
        :heading="isEditing ? 'Edit Bucket' : 'Create New Bucket'"
    >
        <div class="max-h-[500px] overflow-auto scrollbar-hide">
            <!-- Error and validation display -->
            <div v-if="errors || !isFormValid" class="mb-3">
                <!-- Global errors -->
                <div v-if="errors">
                    <div
                        v-for="(error, idx) in errors"
                        :key="idx"
                        class="mb-1 flex items-center gap-2"
                    >
                        <XCircleIcon class="h-4 w-4 flex-shrink-0 text-red-400" />
                        <p class="text-xs text-zinc-700">{{ error }}</p>
                    </div>
                </div>

                <!-- Real-time validation errors summary -->
                <div v-if="!isFormValid && !errors">
                    <div
                        v-for="validation in validations.filter((v: any) => !v.isValid)"
                        :key="validation.id"
                        class="mb-1 flex items-center gap-2"
                    >
                        <XCircleIcon class="h-4 w-4 flex-shrink-0 text-red-400" />
                        <p class="text-xs text-zinc-700">{{ validation.message }}</p>
                    </div>
                </div>
            </div>
            <div class="space-y-2">
                <!-- bucket name -->
                <div>
                    <label for="bucket-name" class="mb-1 block text-xs font-medium text-gray-700"
                        >Name</label
                    >
                    <LInput
                        id="bucket-name"
                        name="bucketName"
                        v-model="(isEditing ? editableBucket : newBucket)!.name"
                        type="text"
                        placeholder="My Images or user-uploads"
                        :class="{
                            'border-red-300':
                                hasFieldError('bucketName') || hasFieldError('bucketNameFormat'),
                        }"
                        @blur="
                            () => {
                                touchField('bucketName');
                                touchField('bucketNameFormat');
                            }
                        "
                        @input="
                            () => {
                                touchField('bucketName');
                                touchField('bucketNameFormat');
                            }
                        "
                    />
                </div>

                <!-- bucket public URL -->
                <div>
                    <label for="bucket-path" class="mb-1 block text-xs font-medium text-gray-700"
                        >Public URL</label
                    >
                    <LInput
                        id="bucket-path"
                        name="bucketPath"
                        v-model="(isEditing ? editableBucket : newBucket)!.publicUrl"
                        type="text"
                        placeholder="http://localhost:9000/bucket-name"
                        :class="{
                            'border-red-300':
                                hasFieldError('publicUrl') || hasFieldError('publicUrlFormat'),
                        }"
                        @blur="
                            () => {
                                touchField('publicUrl');
                                touchField('publicUrlFormat');
                            }
                        "
                        @input="
                            () => {
                                touchField('publicUrl');
                                touchField('publicUrlFormat');
                            }
                        "
                    />
                    <p v-if="!isEditing" class="mt-0.5 text-[11px] text-gray-500">
                        Must be set manually including "http://" or "https://"
                    </p>
                </div>

                <!-- Bucket Type -->
                <LSelect
                    v-model="(isEditing ? editableBucket : newBucket)!.bucketType"
                    :label="'Bucket Type'"
                    :options="
                        availableBucketType.map((bucketType: string) => ({
                            label: capitaliseFirstLetter(bucketType),
                            value: bucketType,
                        }))
                    "
                    :disabled="isLoading"
                />

                <!-- Allowed File Types -->
                <div>
                    <label class="mb-1 block text-xs font-medium text-gray-700">
                        Allowed File Types
                    </label>
                    <div class="space-y-1.5">
                        <div class="flex flex-wrap gap-1.5">
                            <span
                                v-for="fileType in (isEditing ? editableBucket : newBucket)!
                                    .mimeTypes"
                                :key="fileType"
                                class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs text-blue-800"
                            >
                                {{ fileType }}
                                <button
                                    type="button"
                                    @click="removeFileType(fileType)"
                                    :disabled="isLoading"
                                    class="ml-1.5 text-blue-600 hover:text-blue-800 focus:outline-none"
                                >
                                    <XMarkIcon class="h-3.5 w-3.5" />
                                </button>
                            </span>
                        </div>
                        <div class="flex gap-2">
                            <LInput
                                v-model="newFileType"
                                name=""
                                type="text"
                                placeholder="image/jpeg or image/*"
                                class="flex-1"
                                :disabled="isLoading"
                                @keyup.enter="addFileType"
                            />
                            <LButton
                                @click="addFileType"
                                :disabled="!newFileType.trim() || isLoading"
                                size="sm"
                                variant="primary"
                                :icon="PlusIcon"
                            >
                                Add
                            </LButton>
                        </div>
                    </div>
                    <p class="mt-0.5 text-[11px] text-gray-500">
                        e.g., "image/*", "video/mp4", "application/pdf"
                    </p>
                </div>

                <!-- Group Membership -->
                <div>
                    <LCombobox
                        v-model:selected-options="
                            (isEditing ? editableBucket : newBucket)!.memberOf as string[]
                        "
                        :label="`Group Membership`"
                        :options="
                            availableGroups.map((group: GroupDto) => ({
                                id: group._id,
                                label: group.name,
                                value: group._id,
                            }))
                        "
                        :show-selected-in-dropdown="false"
                        :showSelectedLabels="true"
                        :disabled="false"
                        data-test="groupSelector"
                    />
                </div>

                <!-- Credentials status for existing buckets -->
                <div v-if="isEditing && !shouldShowCredentialsSection" class="border-t pt-2">
                    <div class="rounded-md border border-blue-200 bg-blue-50 p-2">
                        <div class="flex gap-2">
                            <div class="flex-shrink-0">
                                <svg
                                    class="h-4 w-4 text-blue-400"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                            </div>
                            <div>
                                <h3 class="font-fold text-xs text-blue-800">
                                    Credentials Configured
                                </h3>
                                <p class="mt-0.5 text-xs text-blue-700">
                                    This bucket has
                                    {{ editableBucket?.credential_id ? "encrypted" : "embedded" }}
                                    credentials. Cannot be edited directly for security.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- S3 Credentials -->

                <div v-if="shouldShowCredentialsSection" class="border-t pt-2">
                    <div class="mb-2 flex items-center justify-between">
                        <h3 class="text-sm font-medium text-gray-900">
                            S3 Credentials
                            <span v-if="!isEditing" class="text-red-500">*</span>
                        </h3>
                        <LButton
                            @click="showCredentials = !showCredentials"
                            variant="tertiary"
                            size="sm"
                        >
                            {{ showCredentials ? "Hide" : isEditing ? "Update" : "Set" }}
                        </LButton>
                    </div>

                    <!-- Required notice for new buckets -->
                    <div
                        v-if="
                            !isEditing &&
                            !showCredentials &&
                            hasAttemptedSubmit &&
                            !hasValidCredentials
                        "
                        class="mb-2 rounded-md border border-red-200 bg-red-50 p-2"
                    >
                        <div class="flex gap-2">
                            <div class="flex-shrink-0">
                                <ExclamationTriangleIcon class="h-4 w-4 text-red-400" />
                            </div>
                            <div>
                                <h3 class="text-xs font-medium text-red-800">
                                    Credentials Required
                                </h3>
                                <p class="mt-0.5 text-xs text-red-700">
                                    Click "Set" above to provide S3 credentials.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div v-if="showCredentials" class="space-y-2">
                        <!-- Security Notice  -->
                        <div class="rounded-md border border-yellow-200 bg-yellow-50 p-2">
                            <div class="flex gap-2">
                                <ExclamationTriangleIcon
                                    class="h-4 w-4 flex-shrink-0 text-yellow-600"
                                />
                                <p class="text-[11px] text-yellow-800">
                                    Credentials are encrypted and not retrievable before storage.
                                    {{ isEditing ? "Leave empty to keep existing." : "" }}
                                </p>
                            </div>
                        </div>

                        <!-- Endpoint -->
                        <div>
                            <label
                                for="endpoint"
                                class="mb-1 block text-xs font-medium text-gray-700"
                            >
                                S3 Endpoint
                                <span v-if="!isEditing" class="text-red-500">*</span>
                            </label>
                            <LInput
                                id="endpoint"
                                name="endpoint"
                                v-model="localCredentials.endpoint"
                                type="url"
                                placeholder="https://your-storage-endpoint.com"
                                :disabled="isLoading"
                                :required="!isEditing"
                                :class="{
                                    'border-red-300':
                                        hasFieldError('endpoint') ||
                                        hasFieldError('endpointFormat'),
                                }"
                                @blur="
                                    () => {
                                        touchField('endpoint');
                                        touchField('endpointFormat');
                                    }
                                "
                                @input="
                                    () => {
                                        touchField('endpoint');
                                        touchField('endpointFormat');
                                    }
                                "
                            />
                            <p class="mt-0.5 text-[11px] text-gray-500">
                                Examples of endpoint: <br />
                                • MinIO: http://localhost:9000 <br />
                                • AWS S3: https://s3.amazonaws.com <br />
                                • Cloudflare R2: https://&lt;account-id&gt;.r2.cloudflarestorage.com
                            </p>
                        </div>

                        <!-- Bucket Name -->
                        <div>
                            <label
                                for="bucketName"
                                class="mb-1 block text-xs font-medium text-gray-700"
                            >
                                Bucket Name
                                <span v-if="!isEditing" class="text-red-500">*</span>
                            </label>
                            <LInput
                                id="bucketName"
                                name="bucketName"
                                v-model="localCredentials.bucketName"
                                type="text"
                                placeholder="my-bucket-name"
                                :disabled="isLoading"
                                :required="!isEditing"
                                :class="{ 'border-red-300': hasFieldError('bucketName') }"
                                @blur="() => touchField('bucketName')"
                                @input="() => touchField('bucketName')"
                            />
                            <p class="mt-0.5 text-[11px] text-gray-500">
                                The actual bucket name (do not include in endpoint)
                            </p>
                        </div>

                        <!-- Access Key  -->
                        <div>
                            <label
                                for="accessKey"
                                class="mb-1 block text-xs font-medium text-gray-700"
                            >
                                Access Key
                                <span v-if="!isEditing" class="text-red-500">*</span>
                            </label>
                            <LInput
                                id="accessKey"
                                name=""
                                v-model="localCredentials.accessKey"
                                type="text"
                                placeholder="Your access Key"
                                :disabled="isLoading"
                                :required="!isEditing"
                                :class="{ 'border-red-300': hasFieldError('accessKey') }"
                                @blur="() => touchField('accessKey')"
                                @input="() => touchField('accessKey')"
                            />
                        </div>

                        <!-- Secret Key -->
                        <div>
                            <label
                                for="secretKey"
                                class="mb-1 block text-xs font-medium text-gray-700"
                            >
                                Secret Key
                                <span v-if="!isEditing" class="text-red-500">*</span>
                            </label>
                            <LInput
                                id="secretKey"
                                name=""
                                v-model="localCredentials.secretKey"
                                type="text"
                                placeholder="Enter secret key"
                                :disabled="isLoading"
                                :required="!isEditing"
                                :class="{ 'border-red-300': hasFieldError('secretKey') }"
                                @blur="() => touchField('secretKey')"
                                @input="() => touchField('secretKey')"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <!-- Actions buttons -->
        <div class="flex justify-between border-t pt-3">
            <div>
                <LButton
                    v-if="isEditing && canDelete"
                    @click="deleteBucket"
                    variant="secondary"
                    context="danger"
                    size="sm"
                    :disabled="isLoading"
                >
                    Delete
                </LButton>
            </div>
            <div class="flex gap-2">
                <LButton
                    @click="showModal = false"
                    variant="secondary"
                    size="sm"
                    :disabled="isLoading"
                >
                    Cancel
                </LButton>
                <LButton
                    variant="primary"
                    size="sm"
                    @click="saveBucket"
                    :disabled="isLoading || !isFormValid"
                    :loading="isLoading"
                >
                    {{ isEditing ? "Update" : "Create" }}
                </LButton>
            </div>
        </div>
    </LModal>

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
