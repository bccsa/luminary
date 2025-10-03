<script setup lang="ts">
import { ref, computed, toRaw } from "vue";
import { ExclamationCircleIcon } from "@heroicons/vue/24/outline";
import ImageEditorThumbnail from "./ImageEditorThumbnail.vue";
import {
    type ImageUploadDto,
    type ImageFileCollectionDto,
    maxUploadFileSize,
    type ContentParentDto,
} from "luminary-shared";

type Props = {
    disabled: boolean;
};
defineProps<Props>();

const parent = defineModel<ContentParentDto>("parent");
const maxUploadFileSizeMb = computed(() => maxUploadFileSize.value / 1000000);

// HTML element refs
const uploadInput = ref<typeof HTMLInputElement | undefined>(undefined);
const isDragging = ref(false);
const dragCounter = ref(0);
const showFailureMessage = ref(false);
const failureMessage = ref<string | undefined>(undefined);

const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const fileData = e.target!.result as ArrayBuffer;

            if (fileData.byteLength > maxUploadFileSize.value) {
                failureMessage.value = `Image file size is larger than the maximum allowed size of ${maxUploadFileSizeMb.value}MB`;
                return;
            }

            if (!parent.value) return;
            if (!parent.value.imageData) parent.value.imageData = { fileCollections: [] };
            if (!parent.value.imageData.uploadData) parent.value.imageData.uploadData = [];

            failureMessage.value = "";

            parent.value.imageData.uploadData.push({
                filename: file.name,
                preset: "photo",
                fileData,
            });
        };

        reader.readAsArrayBuffer(file);
    });

    // Reset the file input
    // @ts-ignore - it seems as if the type definition for showPicker is missing in the file input element.
    uploadInput.value!.value = "";
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
                        accept="image/jpeg, image/png, image/webp"
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
