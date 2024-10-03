<script setup lang="ts">
import { computed, ref, toRaw } from "vue";
import LButton from "../button/LButton.vue";
import { ArrowUpOnSquareIcon } from "@heroicons/vue/24/outline";
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

const showFilePicker = () => {
    // @ts-ignore - it seems as if the type definition for showPicker is missing in the file input element.
    uploadInput.value!.showPicker();
};

// Read files into Buffer
const upload = () => {
    // @ts-ignore - it seems as if the type definition for files is missing in the file input element.
    if (!uploadInput.value!.files || uploadInput.value!.files.length == 0) return;

    const reader = new FileReader();
    // @ts-ignore - it seems as if the type definition for files is missing in the file input element.
    const file = uploadInput.value!.files[0];

    reader.onload = (e) => {
        if (!parent.value) return;
        if (!parent.value.imageData) parent.value.imageData = { fileCollections: [] };
        if (!parent.value.imageData.uploadData) parent.value.imageData.uploadData = [];

        const fileData = e.target!.result as ArrayBuffer;

        if (fileData.byteLength > maxUploadFileSize.value) {
            addNotification({
                title: `Invalid image file size`,
                description: `Image file size is larger than the maximum allowed size of ${maxUploadFileSizeMb.value}MB`,
                state: "error",
            });
            return;
        }

        parent.value.imageData.uploadData.push({
            filename: file.name,
            preset: "photo",
            fileData,
        });
    };

    reader.readAsArrayBuffer(file);

    // Reset the file input
    // @ts-ignore - it seems as if the type definition for value is missing in the file input element.
    uploadInput.value!.value = "";
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

    if (parent.value.imageData.uploadData.length == 0) {
        delete parent.value.imageData.uploadData;
    }
};
</script>

<template>
    <div class="flex-col overflow-y-auto">
        <div>
            <p class="mb-2 text-xs">
                You can upload several files in different aspect ratios. The most suitable image
                will automatically be displayed based on the aspect ratio of the image element where
                the image is displayed.
            </p>
            <p class="mb-2 text-xs">
                Uploaded images are automatically scaled for for various screen and display sizes.
            </p>
            <div class="mb-2 flex items-end gap-4" v-if="!disabled">
                <div class="flex flex-col">
                    <LButton :icon="ArrowUpOnSquareIcon" class="h-9" @click="showFilePicker"
                        >Upload</LButton
                    >
                    <input
                        ref="uploadInput"
                        type="file"
                        class="hidden"
                        accept="image/jpeg, image/png, image/webp"
                        @change="upload"
                        data-test="image-upload"
                    />
                </div>
            </div>
        </div>

        <div
            v-if="
                parent &&
                parent.imageData &&
                (parent.imageData.fileCollections.length > 0 || parent.imageData.uploadData)
            "
        >
            <h3 class="mt-4 text-sm font-medium leading-6 text-zinc-900">Image files</h3>

            <div
                class="flex flex-1 flex-wrap gap-4 overflow-x-scroll pt-2"
                data-test="thumbnail-area"
            >
                <ImageEditorThumbnail
                    v-for="c in parent.imageData.fileCollections"
                    :imageFileCollection="c"
                    @deleteFileCollection="removeFileCollection"
                    :key="c.aspectRatio"
                />
                <ImageEditorThumbnail
                    v-for="u in parent.imageData.uploadData"
                    :imageUploadData="u"
                    @deleteUploadData="removeFileUploadData"
                    :key="u.filename"
                />
            </div>
        </div>
    </div>
</template>
