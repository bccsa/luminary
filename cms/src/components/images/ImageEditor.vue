<script setup lang="ts">
import { ref, computed, toRaw, watchEffect } from "vue";
import { ExclamationCircleIcon } from "@heroicons/vue/24/outline";
import ImageEditorThumbnail from "./ImageEditorThumbnail.vue";
import LSelect from "../forms/LSelect.vue";
import {
    type ImageUploadDto,
    type ImageFileCollectionDto,
    maxUploadFileSize,
    type ContentParentDto,
} from "luminary-shared";
import { useBucketSelection } from "@/composables/useBucketSelection";
import { capitaliseFirstLetter } from "@/util/string";

type Props = {
    disabled: boolean;
};
defineProps<Props>();

const emit = defineEmits<{
    bucketSelected: [bucketId: string];
}>();

const parent = defineModel<ContentParentDto>("parent");
const maxUploadFileSizeMb = computed(() => maxUploadFileSize.value / 1000000);

// Bucket selection (simplified approach using existing database data)
const bucketSelection = useBucketSelection();

// Get Bucket HTTP Path method
const bucketBaseUrl = computed(() => {
    // If parent or imageBucketId is not set, pass null to getBucketById (it accepts string | null)
    const bucketId = parent.value?.imageBucketId ?? null;
    const bucket = bucketSelection.getBucketById(bucketId);
    return bucket ? bucket.httpPath : undefined;
});

// Get accepted file types based on selected bucket
const acceptedFileTypes = computed(() => {
    if (!parent.value?.imageBucketId) {
        return "image/*"; // default to all images
    }

    const bucket = bucketSelection.getBucketById(parent.value.imageBucketId);
    if (!bucket || !bucket.fileTypes || bucket.fileTypes.length === 0) {
        return "image/*"; // accept all images if no restrictions
    }

    // Convert fileTypes array to accept attribute format
    return bucket.fileTypes.join(", ");
});

// Get file type description for user
const fileTypeDescription = computed(() => {
    if (!parent.value?.imageBucketId) {
        return "";
    }

    const bucket = bucketSelection.getBucketById(parent.value.imageBucketId);
    if (!bucket || !bucket.fileTypes || bucket.fileTypes.length === 0) {
        return "All image types";
    }

    // Format for display
    return `Accepts: ${bucket.fileTypes.join(", ")}`;
});

// Bucket dropdown options
const bucketOptions = computed(() => {
    return bucketSelection.imageBuckets.value.map((bucket) => ({
        id: bucket._id,
        label: capitaliseFirstLetter(bucket.name),
        value: bucket._id,
    }));
});

// Handle bucket selection change
const handleBucketChange = (bucketId: string) => {
    if (parent.value) {
        parent.value.imageBucketId = bucketId;
        emit("bucketSelected", bucketId);
    }
};

// Validate that selected bucket still exists and auto-select if only one available
watchEffect(() => {
    // Check if the currently selected bucket still exists in the database
    if (parent.value?.imageBucketId) {
        // Only validate if buckets have loaded (array is not empty)
        // This prevents clearing imageBucketId while buckets are still loading from IndexedDB
        if (bucketSelection.imageBuckets.value.length > 0) {
            const currentBucketExists = bucketSelection.imageBuckets.value.some(
                (b) => b._id === parent.value?.imageBucketId,
            );

            // If the bucket no longer exists, clear it
            if (!currentBucketExists) {
                parent.value.imageBucketId = undefined;
            }
        }
    }

    // Auto-select if only one bucket available and none is selected
    if (bucketSelection.autoSelectImageBucket.value && !parent.value?.imageBucketId) {
        parent.value!.imageBucketId = bucketSelection.autoSelectImageBucket.value;
        emit("bucketSelected", bucketSelection.autoSelectImageBucket.value);
    }
});

// HTML element refs
const uploadInput = ref<typeof HTMLInputElement | undefined>(undefined);
const isDragging = ref(false);
const dragCounter = ref(0);
const showFailureMessage = ref(false);
const failureMessage = ref<string | undefined>(undefined);

const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    // Check if a bucket is selected
    if (!parent.value?.imageBucketId) {
        failureMessage.value = "Please select a storage bucket before uploading images.";
        showFailureMessage.value = true;
        return;
    }

    // Check if the currently selected bucket still exists in the database
    const currentBucketExists = bucketSelection.imageBuckets.value.some(
        (b) => b._id === parent.value?.imageBucketId,
    );

    if (!currentBucketExists) {
        parent.value.imageBucketId = undefined;
        failureMessage.value =
            "The selected storage bucket no longer exists. Please select another bucket.";
        showFailureMessage.value = true;
        return;
    }

    // Check if buckets are configured
    if (!bucketSelection.hasImageBuckets.value) {
        failureMessage.value =
            "No storage buckets configured. Please configure at least one S3 bucket in the Storage settings before uploading images.";
        showFailureMessage.value = true;
        return;
    }

    // Process files with the selected bucket
    processFiles(fileArray, parent.value.imageBucketId);

    // Reset the file input
    // @ts-ignore - it seems as if the type definition for showPicker is missing in the file input element.
    uploadInput.value!.value = "";
};

const processFiles = (files: File[], bucketId: string) => {
    files.forEach((file) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const fileData = e.target!.result as ArrayBuffer;

            if (fileData.byteLength > maxUploadFileSize.value) {
                failureMessage.value = `Image file size is larger than the maximum allowed size of ${maxUploadFileSizeMb.value}MB`;
                showFailureMessage.value = true;
                return;
            }

            if (!parent.value) return;
            if (!parent.value.imageData) parent.value.imageData = { fileCollections: [] };
            if (!parent.value.imageData.uploadData) parent.value.imageData.uploadData = [];

            failureMessage.value = "";

            const uploadData: ImageUploadDto = {
                filename: file.name,
                preset: "photo",
                fileData,
                bucketId: bucketId,
            } as ImageUploadDto;

            parent.value.imageData.uploadData.push(uploadData);
        };

        reader.readAsArrayBuffer(file);
    });
};

const upload = () => {
    if (!uploadInput.value) return;
    // @ts-ignore - it seems as if the type definition for files is missing in the file input element.
    handleFiles(uploadInput.value!.files);
};

const removeFileCollection = (collection: ImageFileCollectionDto) => {
    if (!parent.value?.imageData?.fileCollections) return;

    parent.value.imageData.fileCollections = parent.value.imageData.fileCollections
        .filter((f) => f !== collection)
        .map((f) => toRaw(f));
};

const removeFileUploadData = (uploadData: ImageUploadDto) => {
    if (!parent.value?.imageData?.uploadData) return;

    parent.value.imageData.uploadData = parent.value.imageData.uploadData
        .filter((f) => f !== uploadData)
        .map((f) => toRaw(f));

    if (parent.value.imageData.uploadData.length === 0) {
        delete parent.value.imageData.uploadData;
    }
};

// Drag-and-drop handlers
const handleDragEnter = () => {
    dragCounter.value++;
    isDragging.value = true;
};

const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
};

const handleDragLeave = () => {
    dragCounter.value--;
    if (dragCounter.value === 0) {
        isDragging.value = false;
    }
};

const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.value = 0;
    isDragging.value = false;
    handleFiles(e.dataTransfer?.files || null);
};

defineExpose({
    handleFiles,
    uploadInput,
});
</script>

<template>
    <div class="flex flex-col overflow-x-auto">
        <!-- Bucket Selection Dropdown (always show if multiple buckets, or show if none selected) -->
        <div
            v-if="bucketSelection.imageBuckets.value.length > 1 || !parent?.imageBucketId"
            class="px-0.5 pb-2"
        >
            <LSelect
                v-model="parent!.imageBucketId"
                :options="bucketOptions"
                label="Storage Bucket"
                placeholder="Select a storage bucket"
                :disabled="disabled"
                @update:modelValue="handleBucketChange"
            />
            <p
                v-if="fileTypeDescription && parent?.imageBucketId"
                class="mt-1 text-xs text-gray-500"
            >
                {{ fileTypeDescription }}
            </p>
        </div>

        <!-- Header with error message toggle -->
        <div :disabled="disabled" class="flex justify-between px-4">
            <div class="flex">
                <button
                    v-if="failureMessage"
                    class="flex cursor-pointer items-center gap-1 rounded-md"
                    @click="showFailureMessage = !showFailureMessage"
                    :title="failureMessage"
                >
                    <ExclamationCircleIcon class="h-5 w-5 text-red-600" />
                </button>
            </div>
        </div>

        <!-- Error Message -->
        <div v-if="showFailureMessage" class="px-4">
            <p class="my-2 text-xs text-red-600">
                {{ failureMessage }}
            </p>
        </div>

        <!-- Full-width Drag and Drop Area -->
        <div
            class="-mx-4 flex w-screen flex-col justify-center bg-white transition duration-150 ease-in-out scrollbar-hide sm:mx-0 sm:w-full"
            @dragenter="handleDragEnter"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
            :class="{
                'border-blue-500 bg-blue-50': isDragging,
            }"
        >
            <!-- Drop instructions -->
            <div class="hidden flex-col items-center justify-center md:flex">
                <p v-if="isDragging" class="text-sm">Drop your files here</p>
                <div v-else>
                    <input
                        ref="uploadInput"
                        type="file"
                        class="mb-4 hidden"
                        :accept="acceptedFileTypes"
                        @change="upload"
                        data-test="image-upload"
                        multiple
                    />
                </div>
            </div>

            <!-- Thumbnails -->
            <div
                v-if="
                    parent &&
                    parent.imageData &&
                    (parent.imageData.fileCollections.length > 0 || parent.imageData.uploadData)
                "
                class="scrollbar-hide"
            >
                <div
                    v-if="
                        !isDragging &&
                        (parent.imageData.fileCollections.length > 0 ||
                            (parent.imageData.uploadData && parent.imageData.uploadData.length > 0))
                    "
                    class="z-40 ml-4 flex w-full min-w-0 flex-1 gap-2 overflow-y-hidden py-1 scrollbar-hide sm:ml-0"
                    data-test="thumbnail-area"
                >
                    <!-- File Collections -->
                    <div
                        v-for="c in parent.imageData.fileCollections"
                        :key="c.aspectRatio"
                        class="flex shrink-0 items-center justify-center gap-0 rounded border-2 border-zinc-200 text-xs shadow scrollbar-hide"
                    >
                        <ImageEditorThumbnail
                            :imageFileCollection="c"
                            :bucketHttpPath="bucketBaseUrl"
                            @deleteFileCollection="removeFileCollection"
                            :disabled="!disabled"
                        />
                    </div>

                    <!-- Upload Data -->
                    <div
                        v-for="u in parent.imageData.uploadData"
                        :key="u.filename"
                        class="flex shrink-0 items-center justify-center rounded text-xs shadow"
                    >
                        <ImageEditorThumbnail
                            :imageUploadData="u"
                            :bucketHttpPath="bucketBaseUrl"
                            @deleteUploadData="removeFileUploadData"
                            :disabled="!disabled"
                        />
                    </div>
                </div>
            </div>

            <!-- No images fallback -->
            <div v-else class="my-4 text-center italic">
                <p class="text-sm text-gray-500">No images uploaded yet.</p>
            </div>
        </div>
    </div>
</template>
