<script setup lang="ts">
import LInput from "../forms/LInput.vue";
import { computed, defineProps, ref, toRaw } from "vue";
import LTextarea from "../forms/LTextarea.vue";
import LButton from "../button/LButton.vue";
import { ArrowUpOnSquareIcon, ArrowDownOnSquareIcon } from "@heroicons/vue/24/outline";
import { TrashIcon } from "@heroicons/vue/24/solid";
import LSelect from "../forms/LSelect.vue";
import ImageEditorThumbnail from "./ImageEditorThumbnail.vue";
import type { Image, Uuid, ImageUploadDto } from "@/types";
import { ImageRepository } from "@/db/repositories/imageRepository";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import { useNotificationStore } from "@/stores/notification";

type Props = {
    imageId?: Uuid;
};
const props = defineProps<Props>();
const imageRepo = new ImageRepository();
const globalConfigStore = useGlobalConfigStore();
const { addNotification } = useNotificationStore();

// Computed
const maxUploadFileSize = computed(() => globalConfigStore.maxUploadFileSize / 1000000);

// Create image object if it doesn't exist
const image = ref<Image | undefined>(undefined);
if (props.imageId) {
    image.value = await imageRepo.find(props.imageId);
} else {
    image.value = imageRepo.new();
}

// Child component refs
const fileName = ref<typeof LInput | undefined>(undefined);
const description = ref<typeof LInput | undefined>(undefined);
const upload = ref<typeof HTMLInputElement | undefined>(undefined);

const presets = [
    { label: "default", value: "default" },
    { label: "photo", value: "photo" },
    { label: "picture", value: "picture" },
    { label: "drawing", value: "drawing" },
    { label: "icon", value: "icon" },
    { label: "text", value: "text" },
];
const selectedPreset = ref(presets[0].value);

// Methods
const save = () => {
    if (image.value) {
        imageRepo.upsert(toRaw(image.value));
    }
};

const showFilePicker = () => {
    // @ts-ignore
    upload.value!.showPicker();
};

// Read files into Buffer
const selectFiles = () => {
    // @ts-ignore
    if (!upload.value!.files || upload.value!.files.length == 0) return;

    const reader = new FileReader();
    // @ts-ignore
    const file = upload.value!.files[0];

    reader.onload = (e) => {
        if (!image.value!.uploadData) image.value!.uploadData = [] as ImageUploadDto[];
        const fileData = e.target!.result as ArrayBuffer;

        if (fileData.byteLength > globalConfigStore.maxUploadFileSize) {
            addNotification({
                title: `Invalid image file size`,
                description: `Image file size is larger than the maximum allowed size of ${maxUploadFileSize.value}MB`,
                state: "error",
            });
            return;
        }

        image.value!.uploadData.push({
            fileData,
            preset: selectedPreset.value,
            filename: file.name,
        });
    };

    reader.readAsArrayBuffer(file);

    // Reset the file input
    // @ts-ignore
    upload.value!.value = "";
};

const deleteFile = (filename: string) => {
    if (image.value) {
        image.value.files = image.value.files
            .filter((f) => f.filename !== filename)
            .map((f) => toRaw(f));
    }
};

const removeUpload = (filename: string) => {
    if (image.value && image.value.uploadData) {
        image.value.uploadData = image.value.uploadData
            .filter((f) => f.filename !== filename)
            .map((f) => toRaw(f));
    }
};
</script>

<template>
    <div class="items-end gap-4 sm:flex">
        <LInput
            ref="fileName"
            v-model="image!.name"
            name="fileName"
            label="Image name"
            class="mb-2 flex-1"
        />
        <div class="mb-2 flex items-end gap-4">
            <LSelect
                name="preset"
                label="Upload preset"
                class="w-fit"
                :options="presets"
                v-model="selectedPreset"
            ></LSelect>
            <div class="flex flex-col">
                <label class="mb-3 w-full text-right text-xs text-zinc-900"
                    >Max size: {{ maxUploadFileSize }}MB</label
                >
                <LButton :icon="ArrowUpOnSquareIcon" class="h-9" @click="showFilePicker"
                    >Upload</LButton
                >
                <input
                    ref="upload"
                    type="file"
                    class="hidden"
                    accept="image/jpeg, image/png, image/webp"
                    @change="selectFiles"
                />
            </div>
            <LButton :icon="ArrowDownOnSquareIcon" class="h-9" @click="save">Save</LButton>
        </div>
    </div>
    <!-- Selected upload files display area -->
    <div v-if="image!.uploadData" class="mb-2 mt-2 flex gap-2">
        <div
            v-for="f in image!.uploadData"
            :key="f.filename"
            class="group relative flex items-center gap-4 rounded-full border border-zinc-200 bg-zinc-100 pl-1 pr-1 text-xs text-zinc-900"
        >
            <span>{{ f.preset }}: {{ f.filename }}</span>
            <TrashIcon
                class="absolute -right-2 -top-2 hidden h-5 w-5 cursor-pointer text-red-500 group-hover:block"
                title="Remove file"
                @click="removeUpload(f.filename!)"
            />
        </div>
    </div>
    <LTextarea
        ref="description"
        name="description"
        label="Description"
        v-model="image!.description"
    />
    <div>
        <!-- Group selector here -->
    </div>

    <h3 class="mt-4 text-sm font-medium leading-6 text-zinc-900">File versions</h3>

    <div class="flex flex-wrap gap-4">
        <!-- eslint-disable-next-line -->
        <ImageEditorThumbnail v-for="i in image!.files" v-bind:imageFile="i" @delete="deleteFile" />
    </div>
</template>
