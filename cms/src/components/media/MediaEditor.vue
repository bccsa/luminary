<script setup lang="ts">
import {
    MediaPreset,
    MediaType,
    type ContentParentDto,
    maxUploadFileSize,
    type MediaUploadDataDto,
    type MediaFileDto,
} from "luminary-shared";
import { computed, ref, toRaw } from "vue";
import { ExclamationCircleIcon } from "@heroicons/vue/24/solid";
import MediaEditorThumbnail from "./MediaEditorThumbnail.vue";

type Props = {
    selectedLanguageId?: string;
    disabled: boolean;
};
const props = defineProps<Props>();

const parent = defineModel<ContentParentDto>("parent");
const maxUploadFileSizeMb = computed(() => maxUploadFileSize.value / 1000000);

// Filter media files by selected language
const currentLanguageFileCollections = computed(() => {
    if (!parent.value?.media?.fileCollections || !props.selectedLanguageId) {
        return parent.value?.media?.fileCollections || [];
    }
    return parent.value.media.fileCollections.filter(
        (f) => f.languageId === props.selectedLanguageId,
    );
});

const currentLanguageUploadData = computed(() => {
    if (!parent.value?.media?.uploadData || !props.selectedLanguageId) {
        return parent.value?.media?.uploadData || [];
    }
    return parent.value.media.uploadData.filter((f) => f.languageId === props.selectedLanguageId);
});

// Check if current language has any media
const hasMediaForCurrentLanguage = computed(() => {
    return (
        currentLanguageFileCollections.value.length > 0 ||
        currentLanguageUploadData.value.length > 0
    );
});

// HTML element refs
const uploadInput = ref<typeof HTMLInputElement | undefined>(undefined);
const isDragging = ref(false);
const dragCounter = ref(0);
const showFailureMessage = ref(false);
const failureMessage = ref<string | undefined>(undefined);
const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Only process the first file since we allow only one media file per language
    const file = files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
        const fileData = e.target!.result as ArrayBuffer;

        if (fileData.byteLength > maxUploadFileSize.value) {
            failureMessage.value = `Media file is larger than the maximum allowed size of ${maxUploadFileSizeMb.value}MB`;
            return;
        }

        if (!parent.value) return;
        if (!parent.value.media || parent.value.media === null) {
            parent.value.media = { fileCollections: [], uploadData: [] };
        }
        if (!parent.value.media.fileCollections) {
            parent.value.media.fileCollections = [];
        }
        if (!parent.value.media.uploadData) {
            parent.value.media.uploadData = [];
        }

        failureMessage.value = "";

        // Remove any existing media for the current language
        if (props.selectedLanguageId) {
            // Remove existing file collections for this language
            parent.value.media.fileCollections = parent.value.media.fileCollections.filter(
                (f) => f.languageId !== props.selectedLanguageId,
            );

            // Remove existing upload data for this language
            parent.value.media.uploadData = parent.value.media.uploadData.filter(
                (f) => f.languageId !== props.selectedLanguageId,
            );
        }

        // remove extension from filename
        const fileNameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");

        parent.value.media.uploadData.push({
            fileData: fileData,
            preset: MediaPreset.Default,
            mediaType: MediaType.Audio,
            filename: fileNameWithoutExtension,
            languageId: props.selectedLanguageId,
        });

        console.log(parent.value.media.uploadData);
    };

    reader.readAsArrayBuffer(file);

    // Reset the file input
    // @ts-ignore - it seems as if the type definition for showPicker is missing in the file input element.
    uploadInput.value!.value = "";
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
                <p v-if="isDragging" class="text-sm">Drop your file here</p>
                <div v-else>
                    <input
                        ref="uploadInput"
                        type="file"
                        class="mb-4 hidden"
                        accept="audio/mp3, audio/aac, audio/opus, audio/wav, audio/x-wav"
                        @change="upload"
                        data-test="audio-upload"
                    />
                </div>
            </div>

            <!-- Thumbnails -->
            <div v-if="hasMediaForCurrentLanguage" class="scrollbar-hide">
                <div
                    v-if="!isDragging && hasMediaForCurrentLanguage"
                    class="z-40 ml-4 flex w-full min-w-0 flex-1 gap-2 overflow-y-hidden py-1 scrollbar-hide sm:ml-0"
                    data-test="thumbnail-area"
                >
                    <!-- File Collections for current language -->
                    <div
                        v-for="c in currentLanguageFileCollections"
                        :key="c.fileUrl"
                        class="flex shrink-0 items-center justify-center gap-0 rounded border-2 border-zinc-200 text-xs shadow scrollbar-hide"
                    >
                        <MediaEditorThumbnail
                            :mediaFile="c"
                            @deleteFileCollection="removeFileCollection"
                            :disabled="!disabled"
                        />
                    </div>

                    <!-- Upload Data for current language -->
                    <div
                        v-for="(a, i) in currentLanguageUploadData"
                        :key="i"
                        class="flex shrink-0 items-center justify-center rounded text-xs shadow"
                    >
                        <MediaEditorThumbnail
                            :mediaUploadData="a"
                            @deleteUploadData="removeFileUploadData"
                            :disabled="!disabled"
                        />
                    </div>
                </div>
            </div>

            <!-- No media fallback -->
            <div v-else class="my-4 text-center italic">
                <p v-if="props.selectedLanguageId" class="text-sm text-gray-500">
                    No media uploaded for this language yet.
                </p>
                <p v-else class="text-sm text-gray-500">No medias uploaded yet.</p>
            </div>
        </div>
    </div>
</template>
