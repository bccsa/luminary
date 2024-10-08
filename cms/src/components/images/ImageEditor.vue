<script setup lang="ts">
import { ref, computed, toRaw } from "vue";
import LButton from "../button/LButton.vue";
import { ArrowUpOnSquareIcon, QuestionMarkCircleIcon } from "@heroicons/vue/24/outline";
import ImageEditorThumbnail from "./ImageEditorThumbnail.vue";
import { useNotificationStore } from "@/stores/notification";
import {
    type ImageUploadDto,
    type ImageFileCollectionDto,
    maxUploadFileSize,
    type PostDto,
    type TagDto,
} from "luminary-shared";

const { addNotification } = useNotificationStore();

type Props = {
    disabled: boolean;
};
defineProps<Props>();

const parent = defineModel<PostDto | TagDto>("parent");
const maxUploadFileSizeMb = computed(() => maxUploadFileSize.value / 1000000);

// HTML element refs
const uploadInput = ref<typeof HTMLInputElement | undefined>(undefined);
const isDragging = ref(false);
const dragCounter = ref(0);
const showHelp = ref(false);

const showFilePicker = () => {
    // @ts-ignore - it seems as if the type definition for showPicker is missing in the file input element.
    uploadInput.value!.showPicker();
};

const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const fileData = e.target!.result as ArrayBuffer;

            if (fileData.byteLength > maxUploadFileSize.value) {
                addNotification({
                    title: `Invalid image file size`,
                    description: `Image file size is larger than the maximum allowed size of ${maxUploadFileSizeMb.value}MB`,
                    state: "error",
                });
                return;
            }

            if (!parent.value) return;
            if (!parent.value.imageData) parent.value.imageData = { fileCollections: [] };
            if (!parent.value.imageData.uploadData) parent.value.imageData.uploadData = [];

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
</script>

<template>
    <div class="flex-col overflow-y-auto">
        <div class="flex justify-between">
            <span class="text-sm font-medium leading-6 text-zinc-900">Image</span>
            <button
                class="flex cursor-pointer items-center gap-1 rounded-md"
                @click="showHelp = !showHelp"
            >
                <QuestionMarkCircleIcon class="h-5 w-5" />
            </button>
        </div>

        <!-- Description and Instructions -->
        <div v-if="showHelp">
            <p class="my-2 text-xs">
                You can upload several files in different aspect ratios. The most suitable image
                will automatically be displayed based on the aspect ratio of the image element where
                the image is displayed.
            </p>
            <p class="mb-2 text-xs">
                Uploaded images are automatically scaled for various screen and display sizes.
            </p>
        </div>

        <!-- Drag and Drop Area or File Picker -->
        <div
            class="mb-4 mt-2 flex min-h-36 flex-col justify-center rounded-md border-2 border-dashed border-gray-300 p-3 transition duration-150 ease-in-out"
            @dragenter="handleDragEnter"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
            :class="{
                ' border-blue-500 bg-blue-50': isDragging,
            }"
        >
            <div class="flex flex-col items-center justify-center">
                <p v-if="isDragging" class="text-sm">Drop your files here</p>
                <div v-else>
                    <LButton :icon="ArrowUpOnSquareIcon" @click="showFilePicker">
                        Drop image file or click to Upload
                    </LButton>
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

            <div
                v-if="
                    parent &&
                    parent.imageData &&
                    (parent.imageData.fileCollections.length > 0 || parent.imageData.uploadData)
                "
            >
                <div v-if="!isDragging">
                    <div class="flex flex-1 flex-wrap gap-2 pt-5" data-test="thumbnail-area">
                        <!-- Display file collections as thumbnails -->
                        <ImageEditorThumbnail
                            v-for="c in parent.imageData.fileCollections"
                            :imageFileCollection="c"
                            @deleteFileCollection="removeFileCollection"
                            :key="c.aspectRatio"
                            :aspectRatio="c.aspectRatio"
                        />

                        <!-- Display uploaded image data as thumbnails -->
                        <ImageEditorThumbnail
                            v-for="u in parent.imageData.uploadData"
                            :imageUploadData="u"
                            @deleteUploadData="removeFileUploadData"
                            :key="u.filename"
                        />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
