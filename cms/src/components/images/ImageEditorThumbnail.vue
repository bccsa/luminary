<script setup lang="ts">
import { TrashIcon } from "@heroicons/vue/24/solid";
import { computed, ref } from "vue";
import LModal from "@/components/common/LModal.vue";
import type { ImageFileCollectionDto, ImageUploadDto } from "luminary-shared";

type Props = {
    imageFileCollection?: ImageFileCollectionDto;
    imageUploadData?: ImageUploadDto;
};
const props = defineProps<Props>();
const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;

const srcset = computed(() => {
    if (props.imageFileCollection)
        return props.imageFileCollection.imageFiles
            .map((f) => `${baseUrl}/${f.filename} ${f.width}w`)
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
</script>

<template>
    <div>
        <div class="group relative" @mouseover="hover = true" @mouseleave="hover = false">
            <img :srcset="srcset" class="h-16 rounded-lg shadow" />
            <TrashIcon
                class="absolute -right-2 -top-2 h-5 w-5 cursor-pointer text-red-500"
                v-show="hover"
                title="Delete file version"
                @click="showModal = true"
            />
        </div>
    </div>
    <LModal
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
