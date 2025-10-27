<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { PlusIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import BucketDisplayCard from "./BucketDisplayCard.vue";
import {
    db,
    DocType,
    type S3BucketDto,
    type S3CredentialDto,
    useDexieLiveQuery,
    type GroupDto,
    AclPermission,
    verifyAccess,
    BucketType,
} from "luminary-shared";
import LModal from "../modals/LModal.vue";
import LInput from "../forms/LInput.vue";
import LCombobox from "../forms/LCombobox.vue";
import LDialog from "../common/LDialog.vue";
import { useNotificationStore } from "@/stores/notification";
import { XCircleIcon, ExclamationCircleIcon } from "@heroicons/vue/20/solid";
import { changeReqErrors } from "luminary-shared";
import { changeReqWarnings } from "luminary-shared";
import LSelect from "../forms/LSelect.vue";
import { capitaliseFirstLetter } from "@/util/string";

type bucketStatus = S3BucketDto & {
    connectionStatus:
        | "connected"
        | "unreachable"
        | "unauthorized"
        | "not-found"
        | "no-credentials"
        | "checking"
        | "unknown";
    statusMessage?: string;
};

// Reactive database queries
const groups = useDexieLiveQuery(
    () => db.docs.where({ type: "group" }).toArray() as unknown as Promise<GroupDto[]>,
    { initialValue: [] as GroupDto[] },
);

const buckets = useDexieLiveQuery(
    () => db.docs.where({ type: "storage" }).toArray() as unknown as Promise<S3BucketDto[]>,
    { initialValue: [] as S3BucketDto[] },
);

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
const bucketToDelete = ref<S3BucketDto | null>(null);
const newFileType = ref<string>("");

const notification = useNotificationStore();

// Enhanced bucket status computation with real connectivity checking
const bucketsWithStatus = computed(() => {
    return buckets.value.map((bucket): bucketStatus => {
        // Determine initial status based on credentials
        let connectionStatus: bucketStatus["connectionStatus"] = "unknown";

        if (!bucket.credential && !bucket.credential_id) {
            connectionStatus = "no-credentials";
        } else {
            // Start with unknown status for buckets with credentials
            connectionStatus = "unknown";
        }

        return {
            ...bucket,
            connectionStatus,
        };
    });
});

const newBucket = ref<S3BucketDto>({
    _id: db.uuid(),
    type: DocType.Storage,
    updatedTimeUtc: Date.now(),
    memberOf: [],
    name: "audios",
    bucketType: BucketType.Image,
    httpPath: "/audios",
    credential: {
        endpoint: "http://localhost:9000",
        accessKey: "minio",
        secretKey: "minio123",
    } as S3CredentialDto,
    fileTypes: [],
});

const editableBucket = ref<S3BucketDto | null>(null);
const isEditing = computed(() => !!editableBucket.value);

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
        } else {
            // Clear error when modal is closed
            errors.value = null;
            // Clear editing state when modal is closed
            if (isEditing.value) {
                editableBucket.value = null;
            }
            hasAttemptedSubmit.value = false; // Reset on close too
        }
    },
    { immediate: false },
);

const localCredentials = ref<S3CredentialDto>({
    endpoint: "http://localhost:9000",
    accessKey: "minio",
    secretKey: "minio123",
});

// Watch for modal opening to populate credentials
watch(showModal, (isOpen) => {
    if (isOpen) {
        const bucket = isEditing.value ? editableBucket.value : newBucket.value;
        const c =
            bucket?.credential ??
            ({
                endpoint: "",
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
        memberOf: ["group-public-content"],
        name: "audios",
        bucketType: BucketType.Image,
        httpPath: "/audio",
        credential: {
            endpoint: "http://localhost:9000",
            accessKey: "minio",
            secretKey: "minio123",
        } as S3CredentialDto,
        fileTypes: ["audio/*"],
    };
}

function addFileType() {
    const fileType = newFileType.value.trim();
    const bucket = isEditing.value ? editableBucket.value : newBucket.value;

    if (fileType && bucket && !bucket.fileTypes.includes(fileType)) {
        bucket.fileTypes.push(fileType);
        newFileType.value = "";
    }
}

const availableBucketType = Object.values(BucketType);

function removeFileType(fileType: string) {
    const bucket = isEditing.value ? editableBucket.value : newBucket.value;
    if (!bucket) return;

    const index = bucket.fileTypes.indexOf(fileType);
    if (index > -1) {
        bucket.fileTypes.splice(index, 1);
    }
}

function editBucket(bucket: S3BucketDto) {
    editableBucket.value = { ...bucket };
    showModal.value = true;
}

function deleteBucket(bucketWithStatus: bucketStatus) {
    // Find the original bucket without computed properties
    const originalBucket = buckets.value.find((b) => b._id === bucketWithStatus._id);
    if (originalBucket) {
        bucketToDelete.value = originalBucket;
        showDeleteModal.value = true;
    }
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
const accessKeyProvided = computed(() => !!localCredentials.value.accessKey?.trim());
const secretKeyProvided = computed(() => !!localCredentials.value.secretKey?.trim());

// Computed to check if all credential fields are provided
const hasCompleteCredentials = computed(
    () => endpointProvided.value && accessKeyProvided.value && secretKeyProvided.value,
);

// Computed to check if any credential fields are provided
const hasPartialCredentials = computed(
    () => endpointProvided.value || accessKeyProvided.value || secretKeyProvided.value,
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

        // Validate bucket name format (S3 rules)
        validate(
            "Bucket name must follow S3 naming rules: 3-63 characters, lowercase letters, numbers, hyphens, and periods only.",
            "bucketNameFormat",
            validations.value,
            bucket,
            (b) => {
                const name = b.name?.trim();
                if (!name) return true; // Skip if empty (handled by required validation)

                // Length check
                if (name.length < 3 || name.length > 63) return false;

                // Only lowercase letters, numbers, hyphens, and periods
                if (!/^[a-z0-9.-]+$/.test(name)) return false;

                // Cannot start or end with hyphen or period
                if (
                    name.startsWith("-") ||
                    name.startsWith(".") ||
                    name.endsWith("-") ||
                    name.endsWith(".")
                )
                    return false;

                // Cannot be formatted as an IP address
                if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return false;

                return true;
            },
        );

        // Validate HTTP path
        validate(
            "HTTP path is required",
            "httpPath",
            validations.value,
            bucket,
            (b) => !!b.httpPath?.trim(),
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

// Helper function to check if a field has an error and should show it
const hasFieldError = (fieldId: string) => {
    if (!hasAttemptedSubmit.value) return false; // Don't show errors until submit is attempted
    const validation = getFieldValidation(fieldId);
    return validation && !validation.isValid;
};

// Helper function to get error message for a field
const getFieldError = (fieldId: string) => {
    if (!hasAttemptedSubmit.value) return ""; // Don't show errors until submit is attempted
    const validation = getFieldValidation(fieldId);
    return validation && !validation.isValid ? validation.message : "";
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

// async function testConnection(bucket: S3BucketDto) {
//     try {
//         const result = await db.get(bucket._id);

//         // Show notification with result
//         if (result.status === "connected") {
//             notification.addNotification({
//                 title: "Bucket connection successful",
//                 state: "success",
//             });
//         } else {
//             notification.addNotification({
//                 title: "Connection failed",
//                 description: result.message || result.status,
//                 state: "error",
//             });
//         }
//     } catch (error) {
//         console.error("Failed to test connection:", error);
//         notification.addNotification({
//             title: "Failed to test bucket connection",
//             state: "error",
//         });
//     }
// }
</script>

<template>
    <div>
        <div class="border-b border-gray-200 py-4">
            <div class="flex items-center justify-between px-3 sm:px-0">
                <h2 class="text-lg font-medium text-gray-900">S3 Buckets</h2>
                <div class="flex items-center space-x-2">
                    <LButton :icon="PlusIcon" @click="showModal = true" :disabled="isLoading">
                        Add Bucket
                    </LButton>
                </div>
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
            <div class="mt-6">
                <LButton
                    :icon="PlusIcon"
                    variant="primary"
                    @click="showModal = true"
                    :disabled="false"
                >
                    Create Bucket
                </LButton>
            </div>
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
                    @delete="deleteBucket"
                />
            </div>
        </div>
    </div>

    <!-- Create/Edit Bucket Modal -->
    <LModal
        v-model:isVisible="showModal"
        :heading="isEditing ? 'Edit Bucket' : 'Create New Bucket'"
    >
        <div class="max-h-96 overflow-auto">
            <!-- Error and validation display -->
            <div v-if="errors || (!isFormValid && hasAttemptedSubmit)" class="mb-4">
                <!-- Global errors -->
                <div v-if="errors">
                    <div
                        v-for="(error, idx) in errors"
                        :key="idx"
                        class="mb-2 flex items-center gap-2"
                    >
                        <p>
                            <XCircleIcon class="h-4 w-4 text-red-400" />
                        </p>
                        <p class="text-sm text-zinc-700">{{ error }}</p>
                    </div>
                </div>

                <!-- Real-time validation errors -->
                <div v-if="!isFormValid && !errors && hasAttemptedSubmit">
                    <div class="mb-2 flex items-center gap-2">
                        <p>
                            <ExclamationCircleIcon class="h-4 w-4 text-yellow-400" />
                        </p>
                        <p class="text-sm text-zinc-700">Please fix the following issues:</p>
                    </div>
                    <div
                        v-for="validation in validations.filter((v: any) => !v.isValid)"
                        :key="validation.id"
                        class="mb-1 ml-6 flex items-center gap-2"
                    >
                        <p>
                            <XCircleIcon class="h-3 w-3 text-red-400" />
                        </p>
                        <p class="text-xs text-zinc-700">{{ validation.message }}</p>
                    </div>
                </div>
            </div>
            <div class="space-y-2">
                <!-- bucket name -->
                <div>
                    <label for="bucket-name" class="block text-sm font-medium text-gray-700"
                        >Name</label
                    >
                    <LInput
                        id="bucket-name"
                        name="bucketName"
                        v-model="(isEditing ? editableBucket : newBucket)!.name"
                        type="text"
                        placeholder="Images"
                        :class="{ 'border-red-300': hasFieldError('bucketName') }"
                    />
                    <p v-if="hasFieldError('bucketName')" class="mt-1 text-xs text-red-600">
                        {{ getFieldError("bucketName") }}
                    </p>
                </div>

                <!-- bucket http -->
                <div>
                    <label for="bucket-path" class="block text-sm font-medium text-gray-700"
                        >Http path</label
                    >
                    <LInput
                        id="bucket-path"
                        name="bucketPath"
                        v-model="(isEditing ? editableBucket : newBucket)!.httpPath"
                        type="text"
                        placeholder="/images"
                        :class="{ 'border-red-300': hasFieldError('httpPath') }"
                    />
                    <p v-if="hasFieldError('httpPath')" class="mt-1 text-xs text-red-600">
                        {{ getFieldError("httpPath") }}
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
                    <label class="mb-0.5 block text-sm font-medium text-gray-700">
                        Allowed File Types
                    </label>
                    <div class="space-y-0.5">
                        <div class="flex flex-wrap gap-2">
                            <span
                                v-for="fileType in (isEditing ? editableBucket : newBucket)!
                                    .fileTypes"
                                :key="fileType"
                                class="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800"
                            >
                                {{ fileType }}
                                <button
                                    type="button"
                                    @click="removeFileType(fileType)"
                                    :disabled="isLoading"
                                    class="ml-2 text-blue-600 hover:text-blue-800 focus:outline-none"
                                >
                                    <XMarkIcon class="h-4 w-4" />
                                </button>
                            </span>
                        </div>
                        <div class="flex space-x-2">
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
                    <p class="mt-1 text-[12px] text-gray-500">
                        MIME types or patterns (e.g., "image/*", "video/mp4", "application/pdf")
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
                            groups.map((group: GroupDto) => ({
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
                <div v-if="isEditing && !shouldShowCredentialsSection" class="border-t pt-3">
                    <div class="rounded-md border border-blue-200 bg-blue-50 p-3">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <svg
                                    class="h-5 w-5 text-blue-400"
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
                            <div class="ml-3">
                                <h3 class="text-sm font-medium text-blue-800">
                                    Credentials Configured
                                </h3>
                                <p class="mt-1 text-sm text-blue-700">
                                    This bucket already has
                                    {{ editableBucket?.credential_id ? "encrypted" : "embedded" }}
                                    credentials configured. Credentials cannot be edited directly
                                    for security reasons.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- S3 Credentials -->
                <div v-if="shouldShowCredentialsSection" class="border-t pt-3">
                    <div class="mb-4 flex items-center justify-between">
                        <h3 class="text-lg font-medium text-gray-900">
                            S3 Credentials
                            <span v-if="!isEditing" class="text-red-500">*</span>
                        </h3>
                        <LButton
                            @click="showCredentials = !showCredentials"
                            variant="secondary"
                            size="sm"
                        >
                            {{ isEditing ? "Update" : "Set" }} Credentials
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
                        class="mb-4 rounded-md border border-red-200 bg-red-50 p-3"
                    >
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <ExclamationTriangleIcon class="h-5 w-5 text-red-400" />
                            </div>
                            <div class="ml-3">
                                <h3 class="text-sm font-medium text-red-800">
                                    Credentials Required
                                </h3>
                                <p class="mt-1 text-sm text-red-700">
                                    S3 credentials are required to create a new bucket. Click "Show
                                    Credentials" to provide them.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div v-if="showCredentials" class="space-y-4">
                        <!-- Endpoint -->
                        <div>
                            <label
                                for="endpoint"
                                class="mb-0.5 block text-sm font-medium text-gray-700"
                            >
                                S3 Endpoint
                                <span v-if="!isEditing" class="text-red-500">*</span>
                            </label>
                            <LInput
                                id="endpoint"
                                name="endpoint"
                                v-model="localCredentials.endpoint"
                                type="url"
                                placeholder="https://s3.amazonaws.com or http://localhost:9000"
                                :disabled="isLoading"
                                :required="!isEditing"
                                :class="{ 'border-red-300': hasFieldError('endpoint') }"
                            />
                            <p v-if="hasFieldError('endpoint')" class="mt-1 text-xs text-red-600">
                                {{ getFieldError("endpoint") }}
                            </p>
                            <p class="mt-1 text-xs text-gray-500">
                                Full URL including protocol (http:// or https://)
                            </p>
                        </div>

                        <!-- Access Key  -->
                        <div>
                            <label
                                for="accessKey"
                                class="mb-0.5 block text-sm font-medium text-gray-700"
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
                            />
                            <p v-if="hasFieldError('accessKey')" class="mt-1 text-xs text-red-600">
                                {{ getFieldError("accessKey") }}
                            </p>
                        </div>

                        <!-- Secret Key -->
                        <div>
                            <label
                                for="secretKey"
                                class="mb-0.5 block text-sm font-medium text-gray-700"
                            >
                                Secret Key
                                <span v-if="!isEditing" class="text-red-500">*</span>
                            </label>
                            <LInput
                                id="secretKey"
                                name=""
                                v-model="localCredentials.secretKey"
                                type="password"
                                placeholder="Enter secret key"
                                :disabled="isLoading"
                                :required="!isEditing"
                                :class="{ 'border-red-300': hasFieldError('secretKey') }"
                            />
                            <p v-if="hasFieldError('secretKey')" class="mt-1 text-xs text-red-600">
                                {{ getFieldError("secretKey") }}
                            </p>
                        </div>

                        <!-- Security Notice  -->
                        <div class="rounded-md border border-yellow-200 bg-yellow-50 p-3">
                            <div class="flex">
                                <ExclamationTriangleIcon class="h-8 w-8 text-yellow-400" />
                                <div class="ml-3">
                                    <h3 class="text-sm font-medium text-yellow-800">
                                        Security Notice
                                    </h3>
                                    <p class="mt-1 text-[12px] text-yellow-700">
                                        Credentials are encrypted before being stored in the
                                        database.
                                        {{
                                            isEditing
                                                ? "Leave empty to keep existing credentials."
                                                : "All fields are required for new buckets."
                                        }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Actions buttons -->
                <div class="mt-6 flex justify-end space-x-3 border-t pt-4">
                    <LButton @click="showModal = false" variant="secondary" :disabled="isLoading">
                        Cancel
                    </LButton>
                    <LButton
                        variant="primary"
                        @click="saveBucket"
                        :disabled="isLoading || !isFormValid"
                        :loading="isLoading"
                    >
                        {{ isEditing ? "Update Bucket" : "Create Bucket" }}
                    </LButton>
                </div>
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
