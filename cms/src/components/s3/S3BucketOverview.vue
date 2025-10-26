<script setup lang="ts">
import { ref, watch, computed } from "vue";
import {
    PlusIcon,
    PencilIcon,
    TrashIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
    XMarkIcon,
} from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import {
    db,
    DocType,
    type S3BucketDto,
    type S3CredentialDto,
    useDexieLiveQuery,
    type GroupDto,
} from "luminary-shared";
import LModal from "../modals/LModal.vue";
import LInput from "../forms/LInput.vue";
import LCombobox from "../forms/LCombobox.vue";
import LDialog from "../common/LDialog.vue";
import { useNotificationStore } from "@/stores/notification";
import { XCircleIcon } from "@heroicons/vue/20/solid";

type bucketStatus = S3BucketDto & { connectionStatus: string };

// Reactive database queries
const groups = useDexieLiveQuery(
    () => db.docs.where({ type: "group" }).toArray() as unknown as Promise<GroupDto[]>,
    { initialValue: [] as GroupDto[] },
);

const buckets = useDexieLiveQuery(
    () => db.docs.where({ type: DocType.Storage }).toArray() as unknown as Promise<S3BucketDto[]>,
    { initialValue: [] as S3BucketDto[] },
);

const isLoading = ref(false);
const error = ref<string[] | null>(null);
const showModal = ref(false);
const showCredentials = ref(false);
const showDeleteModal = ref(false);
const bucketToDelete = ref<S3BucketDto | null>(null);
const newFileType = ref<string>("");

const notification = useNotificationStore();

// Enhanced bucket status computation
const bucketsWithStatus = computed(() => {
    return buckets.value.map((bucket): bucketStatus => {
        // You can enhance this logic to actually test bucket connectivity
        let connectionStatus = "unknown";

        if (bucket.credential || bucket.credential_id) {
            connectionStatus = "connected"; // You can implement actual connectivity check
        } else {
            connectionStatus = "error";
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
    name: "",
    httpPath: "",
    credential: {
        endpoint: "",
        accessKey: "",
        secretKey: "",
    } as S3CredentialDto,
    fileTypes: [],
});

const editableBucket = ref<S3BucketDto | null>(null);
const isEditing = computed(() => !!editableBucket.value);

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
        } else {
            // Clear error when modal is closed
            error.value = null;
            // Clear editing state when modal is closed
            if (isEditing.value) {
                editableBucket.value = null;
            }
        }
    },
    { immediate: false },
);

const localCredentials = ref<S3CredentialDto>({
    endpoint: "",
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
                accessKey: "",
                secretKey: "",
            } as S3CredentialDto);
        localCredentials.value = { ...c };
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
        httpPath: "",
        credential: {
            endpoint: "",
            accessKey: "",
            secretKey: "",
        } as S3CredentialDto,
        fileTypes: [],
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

    isLoading.value = true;
    try {
        // Mark bucket for deletion using the same pattern as other components
        bucketToDelete.value.deleteReq = 1;
        bucketToDelete.value.updatedTimeUtc = Date.now();

        await db.upsert({
            doc: bucketToDelete.value,
        });

        showDeleteModal.value = false;
        bucketToDelete.value = null;
    } catch (err) {
        console.error("Failed to delete bucket:", err);
        error.value = ["Failed to delete bucket"];
    } finally {
        isLoading.value = false;
    }
}

const saveBucket = async () => {
    isLoading.value = true;
    error.value = null;

    try {
        const bucket = isEditing.value ? editableBucket.value : newBucket.value;
        if (!bucket) return;

        // Validate required fields
        if (!bucket.name.trim()) {
            throw new Error("Bucket name is required");
        }
        if (!bucket.httpPath.trim()) {
            throw new Error("HTTP path is required");
        }

        // Only include credentials if they're provided
        const hasCredentials =
            localCredentials.value.endpoint?.trim() ||
            localCredentials.value.accessKey?.trim() ||
            localCredentials.value.secretKey?.trim();

        if (hasCredentials) {
            bucket.credential = { ...localCredentials.value };
        } else {
            // Remove credential field if no credentials provided (use default system config)
            delete bucket.credential;
        }

        await db.upsert({ doc: bucket });

        notification.addNotification({
            title: isEditing.value
                ? `Bucket "${bucket.name}" updated`
                : `Bucket "${bucket.name}" created`,
            description: isEditing.value
                ? `The Bucket "${bucket.name}" has been updated successfully.`
                : `The Bucket "${bucket.name}" has been created successfully.`,
            state: "success",
        });

        showModal.value = false;

        if (isEditing.value) {
            editableBucket.value = null;
        } else {
            resetNewBucket();
        }
    } catch (err) {
        console.error("Failed to save bucket:", err);
        error.value = [err instanceof Error ? err.message : "Failed to save bucket"];
    } finally {
        isLoading.value = false;
    }
};

async function testConnection(bucket: S3BucketDto) {
    // TODO: Implement actual connection testing
    console.log("Testing connection for bucket:", bucket.name);
    // You can call an API endpoint to test the bucket connection
}

const getStatusLabel = (status: string) => {
    switch (status) {
        case "connected":
            return "Connected";
        case "error":
            return "Error";
        case "testing":
            return "Testing...";
        default:
            return "Unknown";
    }
};
</script>

<template>
    <div class="rounded-lg bg-white shadow">
        <div class="border-b border-gray-200 px-6 py-4">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-medium text-gray-900">S3 Buckets</h2>
                <LButton :icon="PlusIcon" @click="showModal = true" :disabled="isLoading">
                    Add Bucket
                </LButton>
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

        <div v-else class="divide-y divide-gray-200">
            <div
                v-for="bucket in bucketsWithStatus"
                :key="bucket._id || bucket.name"
                class="px-6 py-4 hover:bg-gray-50"
            >
                <div class="flex items-center justify-between">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center space-x-3">
                            <h3 class="truncate text-sm font-medium text-gray-900">
                                {{ bucket.name }}
                            </h3>
                            <span
                                :class="{
                                    'bg-green-100 text-green-800':
                                        bucket.connectionStatus === 'connected',
                                    'bg-red-100 text-red-800': bucket.connectionStatus === 'error',
                                    'bg-yellow-100 text-yellow-800':
                                        bucket.connectionStatus === 'testing',
                                    'bg-gray-100 text-gray-800':
                                        bucket.connectionStatus === 'unknown',
                                }"
                                class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                            >
                                <div
                                    v-if="bucket.connectionStatus === 'testing'"
                                    class="mr-1 h-3 w-3 animate-spin rounded-full border-b border-current"
                                ></div>
                                {{ getStatusLabel(bucket.connectionStatus) }}
                            </span>
                        </div>
                        <div class="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                            <span>{{
                                bucket.credential?.endpoint || bucket.credential_id
                                    ? "Configured"
                                    : "Default"
                            }}</span>
                            <span v-if="bucket.credential_id" class="text-blue-600">Encrypted</span>
                            <span v-if="bucket.fileTypes.length">
                                {{ bucket.fileTypes.length }} file type{{
                                    bucket.fileTypes.length !== 1 ? "s" : ""
                                }}
                            </span>
                            <span>{{ bucket.httpPath }}</span>
                        </div>
                    </div>

                    <!-- Action Buttons for Buckets -->
                    <div class="flex items-center space-x-2">
                        <LButton
                            variant="muted"
                            size="sm"
                            :disabled="isLoading || bucket.connectionStatus === 'testing'"
                            @click="testConnection(bucket)"
                        >
                            <ArrowPathIcon class="h-4 w-4" />
                        </LButton>
                        <LButton
                            variant="muted"
                            size="sm"
                            :disabled="isLoading"
                            @click="editBucket(bucket)"
                        >
                            <PencilIcon class="h-4 w-4" />
                        </LButton>
                        <LButton
                            variant="muted"
                            size="sm"
                            context="danger"
                            :disabled="isLoading"
                            @click="deleteBucket(bucket)"
                        >
                            <TrashIcon class="h-4 w-4" />
                        </LButton>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Create/Edit Bucket Modal -->
    <LModal
        v-model:isVisible="showModal"
        :heading="isEditing ? 'Edit Bucket' : 'Create New Bucket'"
    >
        <div v-if="error">
            <div v-if="error" class="mb-2 flex items-center gap-2">
                <p>
                    <XCircleIcon class="h-4 w-4 text-red-400" />
                </p>
                <p class="text-sm text-zinc-700">{{ error }}</p>
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
                />
            </div>

            <!-- bucket http -->
            <div>
                <label for="bucket-name" class="block text-sm font-medium text-gray-700"
                    >Http path</label
                >
                <LInput
                    id="bucket-path"
                    name="bucketPath"
                    v-model="(isEditing ? editableBucket : newBucket)!.httpPath"
                    type="text"
                    placeholder="/images"
                />
            </div>

            <!-- Allowed File Types -->
            <div>
                <label class="mb-0.5 block text-sm font-medium text-gray-700">
                    Allowed File Types
                </label>
                <div class="space-y-0.5">
                    <div class="flex flex-wrap gap-2">
                        <span
                            v-for="fileType in (isEditing ? editableBucket : newBucket)!.fileTypes"
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
                    v-model:selected-options="newBucket.memberOf as string[]"
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

            <!-- S3 Credentials -->
            <div class="border-t pt-3">
                <div class="mb-4 flex items-center justify-between">
                    <h3 class="text-lg font-medium text-gray-900">S3 Credentials</h3>
                    <LButton
                        @click="showCredentials = !showCredentials"
                        variant="secondary"
                        size="sm"
                    >
                        {{ showCredentials ? "Hide" : "Show" }} Credentials
                    </LButton>
                </div>

                <div v-if="showCredentials" class="space-y-4">
                    <!-- Endpoint -->
                    <div>
                        <label
                            for="endpoint"
                            class="mb-0.5 block text-sm font-medium text-gray-700"
                        >
                            S3 Endpoint
                        </label>
                        <LInput
                            id="endpoint"
                            name="endpoint"
                            v-model="localCredentials.endpoint"
                            type="url"
                            placeholder="http://endpoint.com"
                            :disabled="isLoading"
                            required
                        />
                    </div>

                    <!-- Access Key  -->
                    <div>
                        <label
                            for="accessKey"
                            class="mb-0.5 block text-sm font-medium text-gray-700"
                        >
                            Access Key
                        </label>
                        <LInput
                            id="accessKey"
                            name=""
                            v-model="localCredentials.accessKey"
                            type="text"
                            placeholder="Your access Key"
                            :disabled="isLoading"
                        />
                    </div>

                    <!-- Secret Key -->
                    <div>
                        <label
                            for="secretKey"
                            class="mb-0.5 block text-sm font-medium text-gray-700"
                        >
                            Secret Key
                        </label>
                        <LInput
                            id="secretKey"
                            name=""
                            v-model="localCredentials.secretKey"
                            type="password"
                            placeholder="Enter secret key"
                            :disabled="isLoading"
                        />
                    </div>

                    <!-- Security Notice  -->
                    <div class="rounded-md border border-yellow-200 bg-yellow-50 p-3">
                        <div class="flex">
                            <ExclamationTriangleIcon class="h-8 w-8 text-yellow-400" />
                            <div class="ml-3">
                                <h3 class="text-sm font-medium text-yellow-800">Security Notice</h3>
                                <p class="mt-1 text-[12px] text-yellow-700">
                                    Credentials are encrypted before being stored in the database.
                                    Leave empty to use the default system S3 configuration.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Actions buttonss -->
                <div class="flex justify-end space-x-3 border-t pt-2">
                    <LButton @click="showModal = false" variant="secondary" :disabled="isLoading">
                        Cancel
                    </LButton>
                    <LButton
                        variant="primary"
                        @click="saveBucket"
                        :disabled="isLoading"
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
                showDeleteModal = false;
            }
        "
        :secondaryAction="() => (showDeleteModal = false)"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        context="danger"
    ></LDialog>
</template>
