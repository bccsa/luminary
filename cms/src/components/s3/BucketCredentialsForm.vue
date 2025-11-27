<script setup lang="ts">
import { type S3CredentialDto } from "luminary-shared";
import LInput from "../forms/LInput.vue";

const props = defineProps<{
    credentials: S3CredentialDto;
    isLoading: boolean;
    isEditing: boolean;
    hasFieldError: (fieldId: string) => boolean;
    touchField: (fieldId: string) => void;
}>();

const emit = defineEmits<{
    "update:credentials": [credentials: S3CredentialDto];
}>();

// Helper to update credentials
const updateField = (field: keyof S3CredentialDto, value: string) => {
    emit("update:credentials", {
        ...props.credentials,
        [field]: value,
    });
};
</script>

<template>
    <div class="space-y-2">
        <h3 class="text-sm font-medium text-gray-700">S3 Credentials</h3>
        <p class="text-xs text-gray-500">
            {{
                isEditing
                    ? "Update the S3 credentials for this bucket. Leave all fields empty to keep existing credentials."
                    : "Provide your S3-compatible storage credentials. These will be encrypted before being saved."
            }}
        </p>

        <div class="space-y-2">
            <!-- Endpoint -->
            <div>
                <label for="bucket-endpoint" class="mb-1 block text-xs font-medium text-gray-700">
                    S3 Endpoint URL
                    <span v-if="!isEditing" class="text-red-500">*</span>
                </label>
                <LInput
                    id="bucket-endpoint"
                    name=""
                    :model-value="credentials.endpoint"
                    @update:model-value="(value) => updateField('endpoint', value)"
                    type="text"
                    placeholder="https://s3.amazonaws.com or http://localhost:9000"
                    :disabled="isLoading"
                    :required="!isEditing"
                    :class="{
                        'border-red-300':
                            hasFieldError('endpoint') || hasFieldError('endpointFormat'),
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
                    The S3 endpoint URL where your bucket is hosted
                </p>
            </div>

            <!-- Bucket Name (S3 Bucket Name) -->
            <div>
                <label for="s3-bucket-name" class="mb-1 block text-xs font-medium text-gray-700">
                    Bucket Name
                    <span v-if="!isEditing" class="text-red-500">*</span>
                </label>
                <LInput
                    id="s3-bucket-name"
                    name=""
                    :model-value="credentials.bucketName"
                    @update:model-value="(value) => updateField('bucketName', value)"
                    type="text"
                    placeholder="my-bucket-name"
                    :disabled="isLoading"
                    :required="!isEditing"
                    :class="{ 'border-red-300': hasFieldError('bucketName') }"
                    @blur="() => touchField('bucketName')"
                    @input="() => touchField('bucketName')"
                />
                <p class="mt-0.5 text-[11px] text-gray-500">
                    The name of your S3 bucket (without the endpoint URL)
                </p>
            </div>

            <!-- Access Key -->
            <div>
                <label for="bucket-access-key" class="mb-1 block text-xs font-medium text-gray-700">
                    Access Key ID
                    <span v-if="!isEditing" class="text-red-500">*</span>
                </label>
                <LInput
                    id="bucket-access-key"
                    name=""
                    :model-value="credentials.accessKey"
                    @update:model-value="(value) => updateField('accessKey', value)"
                    type="text"
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    :disabled="isLoading"
                    :required="!isEditing"
                    :class="{ 'border-red-300': hasFieldError('accessKey') }"
                    @blur="() => touchField('accessKey')"
                    @input="() => touchField('accessKey')"
                />
            </div>

            <!-- Secret Key -->
            <div>
                <label for="bucket-secret-key" class="mb-1 block text-xs font-medium text-gray-700">
                    Secret Access Key
                    <span v-if="!isEditing" class="text-red-500">*</span>
                </label>
                <LInput
                    id="bucket-secret-key"
                    name=""
                    :model-value="credentials.secretKey"
                    @update:model-value="(value) => updateField('secretKey', value)"
                    type="password"
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    :disabled="isLoading"
                    :required="!isEditing"
                    :class="{ 'border-red-300': hasFieldError('secretKey') }"
                    @blur="() => touchField('secretKey')"
                    @input="() => touchField('secretKey')"
                />
            </div>
        </div>
    </div>
</template>
