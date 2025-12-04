<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { PlusIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import { type StorageDto, type S3CredentialDto, type GroupDto, StorageType } from "luminary-shared";
import LModal from "../modals/LModal.vue";
import LInput from "../forms/LInput.vue";
import LCombobox from "../forms/LCombobox.vue";
import { XCircleIcon } from "@heroicons/vue/20/solid";
import LSelect from "../forms/LSelect.vue";
import { capitaliseFirstLetter } from "@/util/string";

const props = defineProps<{
    isVisible: boolean;
    bucket: StorageDto | undefined;
    isEditing: boolean;
    isLoading: boolean;
    errors: string[] | undefined;
    availableGroups: GroupDto[];
    canDelete: boolean;
    // Validation props
    isFormValid: boolean;
    validations: Array<{ id: string; isValid: boolean; message: string }>;
    hasAttemptedSubmit: boolean;
    hasFieldError: (fieldId: string) => boolean;
    touchField: (fieldId: string) => void;
    localCredentials: S3CredentialDto;
    hasValidCredentials: boolean;
}>();

const emit = defineEmits<{
    "update:isVisible": [value: boolean];
    "update:bucket": [value: StorageDto];
    "update:localCredentials": [value: S3CredentialDto];
    save: [];
    delete: [];
}>();

const newFileType = ref<string>("");
const showCredentials = ref(false);

const availableStorageType = Object.values(StorageType);

// Computed property to ensure storageType always has a valid value
const storageTypeValue = computed({
    get: () => props.bucket?.storageType ?? StorageType.Image,
    set: (value: StorageType) => {
        if (props.bucket) {
            emit("update:bucket", {
                ...props.bucket,
                storageType: value,
            } as StorageDto);
        }
    },
});

// Determine if we should show credentials section
const shouldShowCredentialsSection = computed(() => {
    // Always show for new buckets
    if (!props.isEditing) {
        return true;
    }

    // For existing buckets, always show credentials section to allow updates
    return true;
});

// Watch for modal visibility changes
watch(
    () => props.isVisible,
    (visible) => {
        if (visible) {
            showCredentials.value = false;
        }
    },
);

function addFileType() {
    const fileType = newFileType.value.trim();
    const bucket = props.bucket;

    if (fileType && bucket && !bucket.mimeTypes.includes(fileType)) {
        const updatedBucket = { ...bucket, mimeTypes: [...bucket.mimeTypes, fileType] };
        emit("update:bucket", updatedBucket);
        newFileType.value = "";
    }
}

function removeFileType(fileType: string) {
    const bucket = props.bucket;
    if (!bucket) return;

    const index = bucket.mimeTypes.indexOf(fileType);
    if (index > -1) {
        const updatedMimeTypes = [...bucket.mimeTypes];
        updatedMimeTypes.splice(index, 1);
        const updatedBucket = { ...bucket, mimeTypes: updatedMimeTypes };
        emit("update:bucket", updatedBucket);
    }
}

function closeModal() {
    emit("update:isVisible", false);
}

function handleSave() {
    emit("save");
}

function handleDelete() {
    emit("delete");
}
</script>

<template>
    <LModal
        :isVisible="isVisible"
        @update:isVisible="(value?: boolean) => emit('update:isVisible', value ?? false)"
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
            <div class="space-y-2" v-if="bucket">
                <!-- bucket name -->
                <div>
                    <label for="bucket-name" class="mb-1 block text-xs font-medium text-gray-700"
                        >Name</label
                    >
                    <LInput
                        id="bucket-name"
                        name="bucketName"
                        :model-value="bucket.name"
                        @update:model-value="
                            (value) =>
                                emit('update:bucket', { ...bucket, name: value } as StorageDto)
                        "
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
                        :model-value="bucket.publicUrl"
                        @update:model-value="
                            (value) =>
                                emit('update:bucket', { ...bucket, publicUrl: value } as StorageDto)
                        "
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

                <!-- Storage Type -->
                <LSelect
                    v-model="storageTypeValue"
                    :label="'Storage Type'"
                    :options="
                        availableStorageType.map((type: string) => ({
                            label: capitaliseFirstLetter(type),
                            value: type,
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
                                v-for="fileType in bucket.mimeTypes"
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
                        :selected-options="bucket.memberOf as string[]"
                        @update:selected-options="
                            (value: (string | number)[]) =>
                                emit('update:bucket', {
                                    ...bucket,
                                    memberOf: value as string[],
                                } as StorageDto)
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
                                    {{ bucket.credential_id ? "encrypted" : "embedded" }}
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
                                :model-value="localCredentials.endpoint"
                                @update:model-value="
                                    (value) =>
                                        emit('update:localCredentials', {
                                            ...localCredentials,
                                            endpoint: value,
                                        })
                                "
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
                                :model-value="localCredentials.bucketName"
                                @update:model-value="
                                    (value) =>
                                        emit('update:localCredentials', {
                                            ...localCredentials,
                                            bucketName: value,
                                        })
                                "
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
                                :model-value="localCredentials.accessKey"
                                @update:model-value="
                                    (value) =>
                                        emit('update:localCredentials', {
                                            ...localCredentials,
                                            accessKey: value,
                                        })
                                "
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
                                :model-value="localCredentials.secretKey"
                                @update:model-value="
                                    (value) =>
                                        emit('update:localCredentials', {
                                            ...localCredentials,
                                            secretKey: value,
                                        })
                                "
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
                    @click="handleDelete"
                    variant="secondary"
                    context="danger"
                    size="sm"
                    :disabled="isLoading"
                >
                    Delete
                </LButton>
            </div>
            <div class="flex gap-2">
                <LButton @click="closeModal" variant="secondary" size="sm" :disabled="isLoading">
                    Cancel
                </LButton>
                <LButton
                    variant="primary"
                    size="sm"
                    @click="handleSave"
                    :disabled="isLoading || !isFormValid"
                    :loading="isLoading"
                >
                    {{ isEditing ? "Update" : "Create" }}
                </LButton>
            </div>
        </div>
    </LModal>
</template>
