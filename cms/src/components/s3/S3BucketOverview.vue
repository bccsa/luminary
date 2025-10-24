<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
    PlusIcon,
    PencilIcon,
    TrashIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
} from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import S3BucketForm from "./S3BucketForm.vue";
import { useS3Management } from "../../composables/useS3Management";
import { db, type S3BucketDto, type S3CredentialDto } from "luminary-shared";

const {
    buckets,
    isLoading,
    error,
    loadBuckets,
    createBucket,
    updateBucket,
    deleteBucket,
    testBucketConnection,
} = useS3Management();

// Modal state
const showModal = ref(false);
const editingBucket = ref<S3BucketDto | null>(null);
const bucketToDelete = ref<S3BucketDto | null>(null);
const formLoading = ref(false);
const formError = ref<string | null>(null);

// Load buckets on component mount
onMounted(() => {
    loadBuckets();
});

// Add connection status tracking
const connectionStatus = ref<Record<string, "connected" | "error" | "testing" | "unknown">>({});

// Enhance buckets with connection status
const bucketsWithStatus = computed(() => {
    return buckets.value.map((bucket) => {
        const key = bucket._id ?? bucket._id ?? bucket.name;
        return {
            ...bucket,
            connectionStatus: connectionStatus.value[key] || "unknown",
        };
    });
});

const handleCreateBucket = () => {
    editingBucket.value = null;
    formError.value = null;
    showModal.value = true;
};

const handleEditBucket = (bucket: any) => {
    // Clone the bucket to avoid readonly types coming from the composable
    editingBucket.value = {
        ...bucket,
        fileTypes: Array.isArray(bucket.fileTypes) ? [...bucket.fileTypes] : [],
        credential: {
            endpoint: bucket.credential?.endpoint || "",
            accessKey: bucket.credential?.accessKey || "",
            secretKey: "",
        },
    } as S3BucketDto;
    formError.value = null;
    showModal.value = true;
};

const handleDeleteBucket = (bucket: any) => {
    // Ensure bucketToDelete has mutable array types
    bucketToDelete.value = {
        ...bucket,
        fileTypes: Array.isArray(bucket.fileTypes) ? [...bucket.fileTypes] : [],
    } as S3BucketDto;
};

const closeModal = () => {
    showModal.value = false;
    editingBucket.value = null;
    formError.value = null;
};

const cancelDelete = () => {
    bucketToDelete.value = null;
};

const handleFormSubmit = async (data: { bucket: S3BucketDto; credentials?: S3CredentialDto }) => {
    formLoading.value = true;
    formError.value = null;

    try {
        if (editingBucket.value) {
            const bucketId = db.uuid();

            await updateBucket(bucketId, data.bucket, data.credentials);
        } else {
            await createBucket(data.bucket, data.credentials);
        }
        closeModal();
        // Reload buckets to get the latest data
        await loadBuckets();
    } catch (err) {
        formError.value = err instanceof Error ? err.message : "An error occurred";
    } finally {
        formLoading.value = false;
    }
};

const confirmDelete = async () => {
    if (!bucketToDelete.value) return;

    formLoading.value = true;
    try {
        const bucketId =
            bucketToDelete.value._id ?? bucketToDelete.value._id ?? bucketToDelete.value.name;
        await deleteBucket(bucketId);
        bucketToDelete.value = null;
        // Reload buckets after deletion
        await loadBuckets();
    } catch (err) {
        // Handle error - could show a toast or error message
        console.error("Failed to delete bucket:", err);
    } finally {
        formLoading.value = false;
    }
};

const testConnection = async (bucketId: string) => {
    connectionStatus.value[bucketId] = "testing";

    try {
        const result = await testBucketConnection(bucketId);
        connectionStatus.value[bucketId] = result ? "connected" : "error";
    } catch (err) {
        connectionStatus.value[bucketId] = "error";
        console.error("Connection test failed:", err);
    }
};

const getStatusLabel = (status: string): string => {
    switch (status) {
        case "connected":
            return "Connected";
        case "error":
            return "Connection Failed";
        case "testing":
            return "Testing...";
        default:
            return "Unknown";
    }
};

// const formatFileSize = (bytes: number): string => {
//     const units = ["B", "KB", "MB", "GB"];
//     let size = bytes;
//     let unitIndex = 0;

//     while (size >= 1024 && unitIndex < units.length - 1) {
//         size /= 1024;
//         unitIndex++;
//     }

//     return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
// };
</script>

<template>
    <div class="rounded-lg bg-white shadow">
        <div class="border-b border-gray-200 px-6 py-4">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-medium text-gray-900">S3 Buckets</h2>
                <LButton :icon="PlusIcon" @click="handleCreateBucket" :disabled="isLoading">
                    Add Bucket
                </LButton>
            </div>
        </div>

        <div v-if="isLoading && !buckets.length" class="px-6 py-8 text-center">
            <div class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
            <p class="mt-2 text-sm text-gray-500">Loading buckets...</p>
        </div>

        <div v-else-if="error" class="px-6 py-8">
            <div class="rounded-md border border-red-200 bg-red-50 p-4">
                <div class="flex">
                    <ExclamationTriangleIcon class="h-5 w-5 text-red-400" />
                    <div class="ml-3">
                        <h3 class="text-sm font-medium text-red-800">Error loading buckets</h3>
                        <p class="mt-1 text-sm text-red-700">{{ error }}</p>
                        <div class="mt-3">
                            <LButton @click="loadBuckets" variant="secondary" size="sm">
                                Try Again
                            </LButton>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-else-if="!buckets.length" class="px-6 py-8 text-center">
            <div class="text-gray-400">
                <svg
                    class="mx-auto h-12 w-12"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2M4 13h2m13-4h-2M4 9h2"
                    />
                </svg>
            </div>
            <h3 class="mt-2 text-sm font-medium text-gray-900">No S3 buckets configured</h3>
            <p class="mt-1 text-sm text-gray-500">
                Get started by creating your first S3 bucket configuration.
            </p>
            <div class="mt-6">
                <LButton :icon="PlusIcon" variant="primary" @click="handleCreateBucket">
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
                            <span>{{ bucket.credential?.endpoint }}</span>
                            <span v-if="bucket.fileTypes.length">
                                {{ bucket.fileTypes.length }} file type{{
                                    bucket.fileTypes.length !== 1 ? "s" : ""
                                }}
                            </span>
                            <!-- <span v-if="bucket.maxFileSize">
                                Max size: {{ formatFileSize(bucket.maxFileSize) }}
                            </span> -->
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <LButton
                            @click="testConnection(bucket._id || bucket.name)"
                            variant="muted"
                            size="sm"
                            :disabled="isLoading || bucket.connectionStatus === 'testing'"
                        >
                            <ArrowPathIcon class="h-4 w-4" />
                            Test
                        </LButton>
                        <LButton
                            @click="handleEditBucket(bucket)"
                            variant="muted"
                            size="sm"
                            :disabled="isLoading"
                        >
                            <PencilIcon class="h-4 w-4" />
                            Edit
                        </LButton>
                        <LButton
                            @click="handleDeleteBucket(bucket)"
                            variant="muted"
                            size="sm"
                            context="danger"
                            :disabled="isLoading"
                        >
                            <TrashIcon class="h-4 w-4" />
                            Delete
                        </LButton>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Create/Edit Bucket Modal -->
    <div
        v-if="showModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
        @click="closeModal"
    >
        <div
            class="m-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl"
            @click.stop
        >
            <div class="sticky top-0 z-40 border-b border-gray-200 bg-white px-6 py-4">
                <h2 class="text-lg font-medium text-gray-900">
                    {{ editingBucket ? "Edit Bucket" : "Create New Bucket" }}
                </h2>
            </div>
            <div class="">
                <S3BucketForm
                    :bucket="editingBucket ?? undefined"
                    :is-loading="formLoading"
                    :error="formError"
                    :edit-mode="!!editingBucket"
                    @submit="handleFormSubmit"
                    @cancel="closeModal"
                />
            </div>
        </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div
        v-if="bucketToDelete"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
        @click="cancelDelete"
    >
        <div class="m-4 w-full max-w-md rounded-lg bg-white shadow-xl" @click.stop>
            <div class="border-b border-gray-200 px-6 py-4">
                <h2 class="text-lg font-medium text-red-900">Delete Bucket</h2>
            </div>
            <div class="p-6">
                <p class="text-sm text-gray-700">
                    Are you sure you want to delete the bucket configuration "{{
                        bucketToDelete.name
                    }}"? This action cannot be undone.
                </p>
                <div class="mt-6 flex justify-end space-x-3">
                    <LButton @click="cancelDelete" variant="secondary" :disabled="formLoading">
                        Cancel
                    </LButton>
                    <LButton @click="confirmDelete" context="danger" :loading="formLoading">
                        Delete
                    </LButton>
                </div>
            </div>
        </div>
    </div>
</template>
