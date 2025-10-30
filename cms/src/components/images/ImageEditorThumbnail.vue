<script setup lang="ts">
import { TrashIcon } from "@heroicons/vue/24/solid";
import { computed, ref } from "vue";
import LDialog from "@/components/common/LDialog.vue";
import type { ImageFileCollectionDto, ImageUploadDto } from "luminary-shared";
import fallbackImage from "@/assets/fallback-image-cms.webp";

type Props = {
    imageFileCollection?: ImageFileCollectionDto;
    imageUploadData?: ImageUploadDto;
    disabled?: boolean;
    bucketHttpPath?: string;
};
const props = defineProps<Props>();
const baseUrl = computed(() => {
    return props.bucketHttpPath ? props.bucketHttpPath : "";
});

const srcset = computed(() => {
    if (props.imageFileCollection)
        return props.imageFileCollection.imageFiles
            .map((f) => `${baseUrl.value}/${f.filename} ${f.width}w`)
            .join(", ");

    if (props.imageUploadData)
        return URL.createObjectURL(new Blob([props.imageUploadData.fileData], { type: "image/*" }));

    return "";
});

const emit = defineEmits<{
    (e: "deleteFileCollection", imageFileCollection: ImageFileCollectionDto): void;
    (e: "deleteUploadData", imageUploadData: ImageUploadDto): void;
}>();

const hover = ref(false);
const showModal = ref(false);

const deleteFile = () => {
    if (props.imageFileCollection) {
        emit("deleteFileCollection", props.imageFileCollection);
    }

    if (props.imageUploadData) {
        emit("deleteUploadData", props.imageUploadData);
    }

    showModal.value = false;
};

const cancelDelete = () => {
    showModal.value = false;
};

const deleteMessage = `Are you sure you want to delete the image file?`;

const imageElementError = ref(false);
</script>

<template>
    <div :class="$attrs.class">
        <div class="group relative" @mouseover="hover = true" @mouseleave="hover = false">
            <img
                v-if="!imageElementError"
                :srcset="srcset"
                class="h-16 rounded-sm shadow"
                @error="imageElementError = true"
            />
            <img v-else class="h-16 rounded-sm shadow" :src="fallbackImage" />
            <TrashIcon
                class="absolute -right-2 -top-2 h-5 w-5 cursor-pointer text-red-500"
                v-show="hover && disabled"
                title="Delete file version"
                @click="showModal = true"
            />
        </div>
    </div>
    <div></div>
    <LDialog
        v-model:open="showModal"
        title="Delete file version"
        :description="deleteMessage"
        :primaryAction="deleteFile"
        primaryButtonText="Delete"
        :secondaryAction="cancelDelete"
        secondaryButtonText="Cancel"
        context="danger"
    />
</template>
