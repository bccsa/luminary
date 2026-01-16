<script setup lang="ts">
import {
    MediaPreset,
    MediaType,
    type ContentParentDto,
    maxMediaUploadFileSize,
    type MediaUploadDataDto,
    type MediaFileDto,
    type LanguageDto,
    db,
    DocType,
} from "luminary-shared";
import { computed, ref, toRaw, watchEffect } from "vue";
import { ExclamationCircleIcon } from "@heroicons/vue/24/solid";
import MediaEditorThumbnail from "./MediaEditorThumbnail.vue";
import LDialog from "@/components/common/LDialog.vue";
import LSelect from "../forms/LSelect.vue";
import { storageSelection } from "@/composables/storageSelection";
import { capitaliseFirstLetter } from "@/util/string";

type Props = {
    disabled: boolean;
    /** The bucket ID where existing media are currently stored (before any migration) */
    existingMediaBucketId?: string;
};
defineProps<Props>();

const emit = defineEmits<{
    bucketSelected: [bucketId: string];
}>();

const parent = defineModel<ContentParentDto>("parent");
const maxMediaUploadFileSizeMb = computed(() => maxMediaUploadFileSize.value / 1000000);

// Bucket selection (simplified approach using existing database data)
const bucketSelection = storageSelection();

// Get accepted file types based on selected bucket
const acceptedMimeTypes = computed(() => {
    if (!parent.value?.mediaBucketId) {
        return "audio/*"; // default to common audio formats
    }

    const bucket = bucketSelection.getBucketById(parent.value.mediaBucketId);
    if (!bucket || !bucket.mimeTypes || bucket.mimeTypes.length === 0) {
        return "audio/*"; // default if no restrictions
    }

    // Convert mimeTypes array to accept attribute format
    return bucket.mimeTypes.join(", ");
});

// Get file type description for user
const fileTypeDescription = computed(() => {
    if (!parent.value?.mediaBucketId) {
        return "";
    }

    const bucket = bucketSelection.getBucketById(parent.value.mediaBucketId);
    if (!bucket || !bucket.mimeTypes || bucket.mimeTypes.length === 0) {
        return "All audio types";
    }

    // Format for display
    return `Accepts: ${bucket.mimeTypes.join(", ")}`;
});

// Bucket dropdown options
const bucketOptions = computed(() => {
    return bucketSelection.mediaBuckets.value.map((bucket) => ({
        id: bucket._id,
        label: capitaliseFirstLetter(bucket.name),
        value: bucket._id,
    }));
});

// Handle bucket selection change
const handleBucketChange = (bucketId: string) => {
    if (parent.value) {
        parent.value.mediaBucketId = bucketId;
        emit("bucketSelected", bucketId);
    }
};

// Get all available languages
const availableLanguages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

// Get languages that already have audio files
const usedLanguageIds = computed(() => {
    const fileCollectionLanguages =
        parent.value?.media?.fileCollections?.map((f) => f.languageId) || [];
    const uploadDataLanguages =
        parent.value?.media?.uploadData?.map((f) => f.languageId).filter(Boolean) || [];
    const allLanguageIds = [...fileCollectionLanguages, ...uploadDataLanguages];
    return Array.from(new Set(allLanguageIds));
});

// Check if a language already has audio
const languageHasAudio = (languageId: string) => {
    return usedLanguageIds.value.includes(languageId);
};

// All media files (not filtered by language anymore)
const allFileCollections = computed(() => {
    return parent.value?.media?.fileCollections || [];
});

const allUploadData = computed(() => {
    return parent.value?.media?.uploadData || [];
});

// Check if there's any media
const hasMedia = computed(() => {
    return allFileCollections.value.length > 0 || allUploadData.value.length > 0;
});

// HTML element refs
const uploadInput = ref<typeof HTMLInputElement | undefined>(undefined);
const isDragging = ref(false);
const dragCounter = ref(0);
const showFailureMessage = ref(false);
const failureMessage = ref<string | undefined>(undefined);

// Language selection for upload
const showLanguageSelector = ref(false);
const showReplaceConfirmation = ref(false);
const pendingFile = ref<File | null>(null);
const selectedLanguageForUpload = ref<string | undefined>(undefined);

// Validate that selected bucket still exists and auto-select if only one available
watchEffect(() => {
    // Check if the currently selected bucket still exists in the database
    if (parent.value?.mediaBucketId) {
        // Only validate if buckets have loaded (array is not empty)
        // This prevents clearing mediaBucketId while buckets are still loading from IndexedDB
        if (bucketSelection.mediaBuckets.value.length > 0) {
            const currentBucketExists = bucketSelection.mediaBuckets.value.some(
                (b) => b._id === parent.value?.mediaBucketId,
            );

            // If the bucket no longer exists, clear it
            if (!currentBucketExists) {
                parent.value.mediaBucketId = undefined;
            }
        }
    }

    // Auto-select if only one bucket available and none is selected
    if (bucketSelection.autoSelectMediaBucket.value && !parent.value?.mediaBucketId) {
        parent.value!.mediaBucketId = bucketSelection.autoSelectMediaBucket.value;
        emit("bucketSelected", bucketSelection.autoSelectMediaBucket.value);
    }

    // Proactively show error messages for bucket configuration issues
    // This ensures users see the error immediately, not just when they try to upload
    if (!bucketSelection.hasMediaBuckets.value) {
        // No buckets configured at all
        failureMessage.value =
            "No storage buckets configured. Please configure at least one S3 bucket in the Storage settings before uploading media.";
        showFailureMessage.value = true;
    } else if (!parent.value?.mediaBucketId && bucketSelection.mediaBuckets.value.length > 1) {
        // Multiple buckets available but none selected
        failureMessage.value = "Please select a storage bucket before uploading media.";
        showFailureMessage.value = true;
    } else if (parent.value?.mediaBucketId) {
        // Bucket is selected, clear any bucket-related errors
        // Only clear if the current error is about bucket selection/configuration
        const bucketRelatedErrors = [
            "No storage buckets configured. Please configure at least one S3 bucket in the Storage settings before uploading media.",
            "Please select a storage bucket before uploading media.",
            "The selected storage bucket no longer exists. Please select another bucket.",
        ];
        if (failureMessage.value && bucketRelatedErrors.includes(failureMessage.value)) {
            failureMessage.value = undefined;
            showFailureMessage.value = false;
        }
    }
});

const confirmLanguageAndUpload = () => {
    if (!pendingFile.value || !selectedLanguageForUpload.value) return;

    // Check if the selected language already has audio
    if (languageHasAudio(selectedLanguageForUpload.value)) {
        // Show confirmation modal
        showLanguageSelector.value = false;
        showReplaceConfirmation.value = true;
        return;
    }

    // Proceed with upload if no replacement needed
    processFileUpload(pendingFile.value, selectedLanguageForUpload.value);

    // Reset state
    showLanguageSelector.value = false;
    pendingFile.value = null;
    selectedLanguageForUpload.value = undefined;
};

const confirmReplaceAndUpload = () => {
    if (!pendingFile.value || !selectedLanguageForUpload.value) return;

    processFileUpload(pendingFile.value, selectedLanguageForUpload.value);

    // Reset state
    showReplaceConfirmation.value = false;
    pendingFile.value = null;
    selectedLanguageForUpload.value = undefined;
};

const cancelReplaceConfirmation = () => {
    showReplaceConfirmation.value = false;
    pendingFile.value = null;
    selectedLanguageForUpload.value = undefined;
};

const cancelLanguageSelection = () => {
    showLanguageSelector.value = false;
    pendingFile.value = null;
    selectedLanguageForUpload.value = undefined;
};

const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Only process the first file
    const file = files[0];

    // Check if a bucket is selected
    if (!parent.value?.mediaBucketId) {
        failureMessage.value = "Please select a storage bucket before uploading media.";
        showFailureMessage.value = true;
        return;
    }

    // Check if the currently selected bucket still exists in the database
    const currentBucketExists = bucketSelection.mediaBuckets.value.some(
        (b) => b._id === parent.value?.mediaBucketId,
    );

    if (!currentBucketExists) {
        parent.value.mediaBucketId = undefined;
        failureMessage.value =
            "The selected storage bucket no longer exists. Please select another bucket.";
        showFailureMessage.value = true;
        return;
    }

    // Check if buckets are configured
    if (!bucketSelection.hasMediaBuckets.value) {
        failureMessage.value =
            "No storage buckets configured. Please configure at least one S3 bucket in the Storage settings before uploading media.";
        showFailureMessage.value = true;
        return;
    }

    // Store the pending file and show language selector
    pendingFile.value = file;
    selectedLanguageForUpload.value = availableLanguages.value[0]?._id;
    showLanguageSelector.value = true;
};

const processFileUpload = (file: File, languageId: string) => {
    const reader = new FileReader();

    reader.onload = (e) => {
        const fileData = e.target!.result as ArrayBuffer;

        if (fileData.byteLength > maxMediaUploadFileSize.value) {
            failureMessage.value = `Media file is larger than the maximum allowed size of ${maxMediaUploadFileSizeMb.value}MB`;
            showFailureMessage.value = true;
            return;
        }

        if (!parent.value) return;
        if (!parent.value.media) parent.value.media = { fileCollections: [] };
        if (!parent.value.media.uploadData) parent.value.media.uploadData = [];

        failureMessage.value = "";
        showFailureMessage.value = false;

        // Remove any existing upload data for this language
        parent.value.media.uploadData = parent.value.media.uploadData.filter(
            (f) => f.languageId !== languageId,
        );

        // Create upload data with filename for proper file handling
        const uploadData: MediaUploadDataDto = {
            fileData: fileData,
            preset: MediaPreset.Default,
            mediaType: MediaType.Audio,
            languageId: languageId,
        };

        parent.value.media.uploadData.push(uploadData);
    };

    reader.readAsArrayBuffer(file);

    // Reset the file input
    // @ts-ignore - it seems as if the type definition for showPicker is missing in the file input element.
    if (uploadInput.value) uploadInput.value!.value = "";
};

const upload = () => {
    if (!uploadInput.value) return;
    // @ts-ignore - it seems as if the type definition for files is missing in the file input element.
    handleFiles(uploadInput.value!.files);
};

const removeFileCollection = (collection: MediaFileDto) => {
    if (!parent.value?.media?.fileCollections) return;

    parent.value.media.fileCollections = parent.value.media.fileCollections
        .filter((f) => f !== collection)
        .map((f) => toRaw(f));
};

const removeFileUploadData = (uploadData: MediaUploadDataDto) => {
    if (!parent.value?.media?.uploadData) return;

    parent.value.media.uploadData = parent.value.media.uploadData
        .filter((f) => f !== uploadData)
        .map((f) => toRaw(f));

    if (parent.value.media.uploadData.length === 0) {
        delete parent.value.media.uploadData;
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
        <div v-if="bucketSelection.mediaBuckets.value.length > 1" class="mb-2 px-0.5 pt-1">
            <LSelect
                v-model="parent!.mediaBucketId"
                :options="bucketOptions"
                label="Storage"
                placeholder="Select storage bucket"
                :disabled="disabled"
                @update:modelValue="handleBucketChange"
                class="text-sm"
            />
            <p
                v-if="fileTypeDescription && parent?.mediaBucketId"
                class="mt-1 text-xs text-gray-500"
            >
                {{ fileTypeDescription }}
            </p>
        </div>

        <!-- Header with error message toggle -->
        <div :disabled="disabled" class="flex justify-between">
            <div class="flex gap-1">
                <button
                    v-if="failureMessage"
                    class="flex cursor-pointer items-center gap-1 rounded-md"
                    @click="showFailureMessage = !showFailureMessage"
                    :title="failureMessage"
                >
                    <ExclamationCircleIcon class="h-5 w-5 text-red-600" />
                </button>

                <!-- Error Message -->
                <div v-if="showFailureMessage" class="">
                    <p class="my-2 text-xs text-red-600">
                        {{ failureMessage }}
                    </p>
                </div>
            </div>
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
                        :accept="acceptedMimeTypes"
                        @change="upload"
                        data-test="audio-upload"
                    />
                </div>
            </div>

            <!-- Thumbnails - Show all audio files grouped by language -->
            <div v-if="hasMedia" class="scrollbar-hide">
                <div
                    v-if="!isDragging && hasMedia"
                    class="z-40 ml-4 flex w-full min-w-0 flex-1 gap-2 overflow-y-hidden py-1 scrollbar-hide sm:ml-0"
                    data-test="thumbnail-area"
                >
                    <!-- Group audio files by language -->
                    <div
                        v-for="language in availableLanguages.filter(
                            (lang) =>
                                allFileCollections.some((f) => f.languageId === lang._id) ||
                                allUploadData.some((u) => u.languageId === lang._id),
                        )"
                        :key="language._id"
                        class="flex flex-col justify-center"
                    >
                        <div class="flex gap-2">
                            <!-- File Collections for this language -->
                            <div
                                v-for="c in allFileCollections.filter(
                                    (f) => f.languageId === language._id,
                                )"
                                :key="c.fileUrl"
                                class="flex shrink-0 items-center justify-center gap-0 rounded border-2 border-zinc-200 text-xs shadow scrollbar-hide"
                            >
                                <MediaEditorThumbnail
                                    :mediaFile="c"
                                    :languageCode="language.languageCode.toUpperCase()"
                                    @deleteFileCollection="removeFileCollection"
                                    :disabled="!disabled"
                                />
                            </div>

                            <!-- Upload Data for this language -->
                            <div
                                v-for="(a, i) in allUploadData.filter(
                                    (u) => u.languageId === language._id,
                                )"
                                :key="i"
                                class="flex shrink-0 items-center justify-center gap-0 rounded border-2 border-zinc-200 text-xs shadow scrollbar-hide"
                            >
                                <MediaEditorThumbnail
                                    :mediaUploadData="a"
                                    :languageCode="language.languageCode.toUpperCase()"
                                    @deleteUploadData="removeFileUploadData"
                                    :disabled="!disabled"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- No media fallback -->
            <div v-else class="my-4 text-center italic">
                <p class="text-sm text-gray-500">No audio files uploaded yet.</p>
            </div>
        </div>

        <!-- Language Selection Dialog -->
        <LDialog
            v-model:open="showLanguageSelector"
            title="Select Language for Audio"
            :primaryAction="confirmLanguageAndUpload"
            primaryButtonText="Upload"
            :secondaryAction="cancelLanguageSelection"
            secondaryButtonText="Cancel"
            context="default"
        >
            <div class="mt-4">
                <label
                    for="language-select"
                    class="mb-2 mt-1 block text-sm font-medium text-gray-700"
                >
                    Choose which language this audio file belongs to:
                </label>
                <select
                    id="language-select"
                    v-model="selectedLanguageForUpload"
                    class="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                    <option v-for="lang in availableLanguages" :key="lang._id" :value="lang._id">
                        {{ lang.name }}
                        <span v-if="languageHasAudio(lang._id)"> (has audio)</span>
                    </option>
                </select>
                <p class="mt-2 text-xs text-gray-500">
                    Select a language for this audio file. If a language already has audio, it will
                    be replaced.
                </p>
            </div>
        </LDialog>

        <!-- Replace Confirmation Dialog -->
        <LDialog
            v-model:open="showReplaceConfirmation"
            title="Replace Existing Audio?"
            :primaryAction="confirmReplaceAndUpload"
            primaryButtonText="Replace"
            :secondaryAction="cancelReplaceConfirmation"
            secondaryButtonText="Cancel"
            context="danger"
        >
            <div class="mt-4">
                <p class="text-sm text-gray-700">
                    The selected language already has an audio file. Uploading this new file will
                    replace the existing audio.
                </p>
                <p class="mt-3 text-sm font-medium text-gray-900">
                    Do you want to continue and replace the existing audio?
                </p>
            </div>
        </LDialog>
    </div>
</template>
