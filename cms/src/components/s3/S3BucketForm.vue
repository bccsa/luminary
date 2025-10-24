<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { XMarkIcon, XCircleIcon, ExclamationTriangleIcon, PlusIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import { DocType, type S3BucketDto, type S3CredentialDto } from "luminary-shared";
import LInput from "../forms/LInput.vue";

type Props = {
    bucket?: S3BucketDto;
    isLoading?: boolean;
    error?: string | null;
    editMode?: boolean;
};

type Emits = {
    (e: "submit", data: { bucket: S3BucketDto; credentials?: S3CredentialDto }): void;
    (e: "cancel"): void;
};

const props = withDefaults(defineProps<Props>(), {
    editMode: false,
    isLoading: false,
    error: null,
});

const emit = defineEmits<Emits>();

const localCredentials = ref<S3CredentialDto>({
    endpoint: "",
    accessKey: "",
    secretKey: "",
});

// Form data
const localBucket = ref<S3BucketDto>({
    _id: props.bucket?._id || undefined,
    name: "",
    type: DocType.Storage,
    fileTypes: [],
    httpPath: "",
    credential_id: undefined,
    credential: localCredentials.value,
    updatedTimeUtc: Date.now(),
    memberOf: [],
});

const newFileType = ref("");
const showCredentials = ref(false);

// Initialize form data when bucket prop changes
watch(
    () => props.bucket,
    (bucket) => {
        if (bucket) {
            localBucket.value = { ...bucket };
            showCredentials.value = !!bucket.credential_id;
        }
    },
    { immediate: true },
);

// Computed properties
const isFormValid = computed(() => {
    return (
        localBucket.value.name.trim() !== "" &&
        localBucket.value.httpPath.trim() !== "" &&
        localBucket.value.fileTypes.length > 0 &&
        (!showCredentials.value || localCredentials.value.endpoint.trim() !== "")
    );
});

// Methods
function addFileType() {
    const fileType = newFileType.value.trim();
    if (fileType && !localBucket.value.fileTypes.includes(fileType)) {
        localBucket.value.fileTypes.push(fileType);
        newFileType.value = "";
    }
}

function removeFileType(fileType: string) {
    const index = localBucket.value.fileTypes.indexOf(fileType);
    if (index > -1) {
        localBucket.value.fileTypes.splice(index, 1);
    }
}

function handleSubmit() {
    if (!isFormValid.value) return;

    const credentials =
        showCredentials.value && localCredentials.value.endpoint
            ? localCredentials.value
            : undefined;

    emit("submit", {
        bucket: localBucket.value,
        credentials,
    });
}
</script>

<template>
    <div class="max-h-96 space-y-3 overflow-y-auto px-6">
        <div>
            <label for="bucketName" class="mb-0.5 block text-sm font-medium text-gray-700">
                Bucket Name
            </label>

            <LInput
                name="Bucket name"
                v-model="localBucket.name"
                type="text"
                placeholder="user-uploads"
                :disabled="isLoading"
                required
            />
            <p class="mt-1 text-sm text-gray-500">A unique name for this S3 bucket configuration</p>
        </div>

        <div>
            <label for="httpPath" class="mb-0.5 block text-sm font-medium text-gray-700">
                HTTP Path
            </label>
            <LInput
                name="HTTP Path"
                id="httpPath"
                v-model="localBucket.httpPath"
                type="text"
                placeholder="/uploads"
                :disabled="isLoading"
                required
            />
            <p class="mt-1 text-sm text-gray-500">
                The URL path where files from this bucket will be accessible
            </p>
        </div>

        <div>
            <label class="mb-0.5 block text-sm font-medium text-gray-700">
                Allowed File Types
            </label>
            <div class="space-y-0.5">
                <div class="flex flex-wrap gap-2">
                    <span
                        v-for="fileType in localBucket.fileTypes"
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
            <p class="mt-1 text-sm text-gray-500">
                MIME types or patterns (e.g., "image/*", "video/mp4", "application/pdf")
            </p>
        </div>

        <div class="border-t pt-3">
            <div class="mb-4 flex items-center justify-between">
                <h3 class="text-lg font-medium text-gray-900">S3 Credentials</h3>
                <LButton @click="showCredentials = !showCredentials" variant="secondary" size="sm">
                    {{ showCredentials ? "Hide" : "Show" }} Credentials
                </LButton>
            </div>

            <div v-if="showCredentials" class="space-y-4">
                <div>
                    <label for="endpoint" class="mb-2 block text-sm font-medium text-gray-700">
                        S3 Endpoint
                    </label>
                    <input
                        id="endpoint"
                        v-model="localCredentials.endpoint"
                        type="url"
                        placeholder="https://s3.amazonaws.com or https://minio.example.com"
                        class="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        :disabled="isLoading"
                        required
                    />
                </div>

                <div>
                    <label for="accessKey" class="mb-2 block text-sm font-medium text-gray-700">
                        Access Key
                    </label>
                    <input
                        id="accessKey"
                        v-model="localCredentials.accessKey"
                        type="text"
                        placeholder="AKIA..."
                        class="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        :disabled="isLoading"
                    />
                </div>

                <div>
                    <label for="secretKey" class="mb-2 block text-sm font-medium text-gray-700">
                        Secret Key
                    </label>
                    <input
                        id="secretKey"
                        v-model="localCredentials.secretKey"
                        type="password"
                        placeholder="Enter secret key"
                        class="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        :disabled="isLoading"
                    />
                </div>

                <div class="rounded-md border border-yellow-200 bg-yellow-50 p-3">
                    <div class="flex">
                        <ExclamationTriangleIcon class="h-5 w-5 text-yellow-400" />
                        <div class="ml-3">
                            <h3 class="text-sm font-medium text-yellow-800">Security Notice</h3>
                            <p class="mt-1 text-sm text-yellow-700">
                                Credentials are encrypted before being stored in the database. Leave
                                empty to use the default system S3 configuration.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="error" class="rounded-md border border-red-200 bg-red-50 p-3">
            <div class="flex">
                <XCircleIcon class="h-5 w-5 text-red-400" />
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">Error</h3>
                    <p class="mt-1 text-sm text-red-700">{{ error }}</p>
                </div>
            </div>
        </div>

        <div class="flex justify-end space-x-3 border-t py-6">
            <LButton @click="$emit('cancel')" variant="secondary" :disabled="isLoading">
                Cancel
            </LButton>
            <LButton
                @click="handleSubmit"
                :disabled="!isFormValid || isLoading"
                :loading="isLoading"
            >
                {{ editMode ? "Update" : "Create" }} Bucket
            </LButton>
        </div>
    </div>
</template>
