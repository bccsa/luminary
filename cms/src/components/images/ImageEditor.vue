<script setup lang="ts">
import LInput from "../forms/LInput.vue";
import { computed, defineProps, ref, toRaw } from "vue";
import LTextarea from "../forms/LTextarea.vue";
import LButton from "../button/LButton.vue";
import { ArrowUpOnSquareIcon } from "@heroicons/vue/24/outline";
import ImageEditorThumbnail from "./ImageEditorThumbnail.vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import {
    db,
    type Uuid,
    type ImageUploadDto,
    type ImageDto,
    DocType,
    type ImageFileCollectionDto,
    maxUploadFileSize,
} from "luminary-shared";

// Note: This control is used in a fully reactive mode as we want to show rendered images as soon as they are uploaded. Mixing non-reactive and reactive modes is difficult to implement.

type Props = {
    imageId: Uuid;
};
const props = defineProps<Props>();

// We need to pass a default document to db.getAsRef to avoid a null reference error when the document is not yet loaded.
const image = db.getAsRef<ImageDto>(props.imageId, {
    _id: props.imageId,
    type: DocType.Image,
    name: "",
    description: "",
    fileCollections: [],
    memberOf: [],
    updatedTimeUtc: 0,
});

const { addNotification } = useNotificationStore();

// Computed
const maxUploadFileSizeMb = computed(() => maxUploadFileSize.value / 1000000);

// Child component refs
const nameInput = ref<typeof LInput | undefined>(undefined);
const descriptionInput = ref<typeof LInput | undefined>(undefined);
const uploadInput = ref<typeof HTMLInputElement | undefined>(undefined);

// Methods
const save = () => {
    const raw = toRaw(image.value);
    delete raw.uploadData; // do not re-save upload data as this will trigger a re-render of the image in the API.
    db.upsert<ImageDto>(toRaw(image.value));
};

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
        if (!image.value.uploadData) image.value.uploadData = [] as ImageUploadDto[];
        const fileData = e.target!.result as ArrayBuffer;

        if (fileData.byteLength > maxUploadFileSize.value) {
            addNotification({
                title: `Invalid image file size`,
                description: `Image file size is larger than the maximum allowed size of ${maxUploadFileSizeMb.value}MB`,
                state: "error",
            });
            return;
        }

        // Save the file data
        const raw = toRaw(image.value);
        raw.uploadData = [
            {
                fileData,
                preset: "photo",
                filename: file.name,
            },
        ]; // do not re-save previous upload data as this will trigger a re-render of the image in the API.
        db.upsert<ImageDto>(toRaw(image.value));
    };

    reader.readAsArrayBuffer(file);

    // Reset the file input
    // @ts-ignore - it seems as if the type definition for value is missing in the file input element.
    uploadInput.value!.value = "";
};

const removeFileCollection = (collection: ImageFileCollectionDto) => {
    image.value.fileCollections = image.value.fileCollections
        .filter((f) => f !== collection)
        .map((f) => toRaw(f));
    save();
};
</script>

<template>
    <div class="flex-col">
        <label class="text-xs italic text-zinc-500">Changes are applied immediately</label>
        <div>
            <LInput
                ref="nameInput"
                v-model="image.name"
                name="fileName"
                label="Image name"
                class="mb-2 flex-1"
                @change="save"
                data-test="image-name"
            />
            <div class="mb-2 flex items-end gap-4">
                <div class="flex flex-col">
                    <label class="mb-3 w-full text-right text-xs text-zinc-900"
                        >Max size: {{ maxUploadFileSizeMb }}MB</label
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
                        data-test="image-upload"
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
            data-test="image-description"
        />
        <div>
            <!-- Group selector here -->
        </div>

        <h3 class="mt-4 text-sm font-medium leading-6 text-zinc-900">File versions</h3>

        <div class="flex flex-1 flex-wrap gap-4 overflow-x-scroll pt-2" data-test="thumbnail-area">
            <ImageEditorThumbnail
                v-for="c in image.fileCollections"
                :imageFileCollection="c"
                @delete="removeFileCollection"
                :key="c.aspectRatio"
            />
        </div>
    </div>
</template>
