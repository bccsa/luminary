<script setup lang="ts">
import LInput from "../forms/LInput.vue";
import { computed, defineProps, ref, toRaw } from "vue";
import LTextarea from "../forms/LTextarea.vue";
import LButton from "../button/LButton.vue";
import { ArrowUpOnSquareIcon } from "@heroicons/vue/24/outline";
import LSelect from "../forms/LSelect.vue";
import ImageEditorThumbnail from "./ImageEditorThumbnail.vue";
import type { Uuid, ImageUploadDto, ImageDto } from "@/types";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import { db } from "@/db/baseDatabase";

// Note: This control is used in a fully reactive mode as we want to show rendered images as soon as they are uploaded. Mixing non-reactive and reactive modes is difficult to implement.

type Props = {
    imageId: Uuid;
};
const props = defineProps<Props>();
const image = db.getAsRef<ImageDto>(props.imageId);

const { addNotification } = useNotificationStore();

// Computed
const globalConfigStore = useGlobalConfigStore();
const maxUploadFileSize = computed(() => globalConfigStore.maxUploadFileSize / 1000000);

// Child component refs
const nameInput = ref<typeof LInput | undefined>(undefined);
const descriptionInput = ref<typeof LInput | undefined>(undefined);
const uploadInput = ref<typeof HTMLInputElement | undefined>(undefined);

const presets = [
    { label: "default", value: "default" },
    { label: "photo", value: "photo" },
    { label: "picture", value: "picture" },
    { label: "drawing", value: "drawing" },
    { label: "icon", value: "icon" },
    { label: "text", value: "text" },
];
const selectedPreset = ref(presets[1].value);

// Methods
const save = () => {
    const raw = toRaw(image.value);
    delete raw.uploadData; // do not re-save upload data as this will trigger a re-render of the image in the API.
    db.upsert<ImageDto>(toRaw(image.value));
};

const showFilePicker = () => {
    // @ts-ignore
    uploadInput.value!.showPicker();
};

// Read files into Buffer
const upload = () => {
    // @ts-ignore
    if (!uploadInput.value!.files || uploadInput.value!.files.length == 0) return;

    const reader = new FileReader();
    // @ts-ignore
    const file = uploadInput.value!.files[0];

    reader.onload = (e) => {
        if (!image.value.uploadData) image.value.uploadData = [] as ImageUploadDto[];
        const fileData = e.target!.result as ArrayBuffer;

        if (fileData.byteLength > globalConfigStore.maxUploadFileSize) {
            addNotification({
                title: `Invalid image file size`,
                description: `Image file size is larger than the maximum allowed size of ${maxUploadFileSize.value}MB`,
                state: "error",
            });
            return;
        }

        // Save the file data
        const raw = toRaw(image.value);
        raw.uploadData = [
            {
                fileData,
                preset: selectedPreset.value,
                filename: file.name,
            },
        ]; // do not re-save previous upload data as this will trigger a re-render of the image in the API.
        db.upsert<ImageDto>(toRaw(image.value));
    };

    reader.readAsArrayBuffer(file);

    // Reset the file input
    // @ts-ignore
    uploadInput.value!.value = "";
};

const removeFile = (filename: string) => {
    image.value.files = image.value.files
        .filter((f) => f.filename !== filename)
        .map((f) => toRaw(f));
    save();
};
</script>

<template>
    <label class="text-xs italic text-zinc-500">Changes are applied immediately</label>
    <div class="items-end gap-4 sm:flex">
        <LInput
            ref="nameInput"
            v-model="image.name"
            name="fileName"
            label="Image name"
            class="mb-2 flex-1"
            @change="save"
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
                    ref="uploadInput"
                    type="file"
                    class="hidden"
                    accept="image/jpeg, image/png, image/webp"
                    @change="upload"
                />
            </div>
        </div>
    </div>
    <!-- Selected upload files display area -->
    <div v-if="image.uploadData" class="mb-2 mt-2 flex gap-2">
        <div
            v-for="f in image.uploadData"
            :key="f.filename"
            class="group relative flex items-center gap-4 rounded-full border border-zinc-200 bg-zinc-100 pl-1 pr-1 text-xs text-zinc-900"
        >
            <span>{{ f.preset }}: {{ f.filename }}</span>
        </div>
    </div>
    <LTextarea
        ref="descriptionInput"
        name="description"
        label="Notes"
        v-model="image.description"
        @change="save"
    />
    <div>
        <!-- Group selector here -->
    </div>

    <h3 class="mt-4 text-sm font-medium leading-6 text-zinc-900">File versions</h3>

    <div class="flex flex-wrap gap-4">
        <!-- eslint-disable-next-line -->
        <ImageEditorThumbnail v-for="i in image!.files" v-bind:imageFile="i" @delete="removeFile" />
    </div>
</template>
