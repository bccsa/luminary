<script setup lang="ts">
import { TrashIcon } from "@heroicons/vue/24/solid";
import { ref, computed } from "vue";
import LModal from "../form/LModal.vue";
import type { ImageFileCollectionDto, ImageUploadDto } from "luminary-shared";
import fallbackImage from "@/assets/fallbackImage.webp";

type Props = {
    imageFileCollection?: ImageFileCollectionDto;
    imageUploadData?: ImageUploadDto;
    disabled?: boolean;
};
const props = defineProps<Props>();
const emit = defineEmits<{
    (e: "deleteFileCollection", imageFileCollection: ImageFileCollectionDto): void;
    (e: "deleteUploadData", imageUploadData: ImageUploadDto): void;
}>();

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;
const hover = ref(false);
const showModal = ref(false);
const imageElementError = ref(false);

const deleteMessage = `Are you sure you want to delete the image file?`;

const srcset = computed(() => {
    if (props.imageFileCollection) {
        return props.imageFileCollection.imageFiles
            .map((file) => `${baseUrl}/${file.filename} ${file.width}w`)
            .join(", ");
    }
    if (props.imageUploadData) {
        return URL.createObjectURL(new Blob([props.imageUploadData.fileData], { type: "image/*" }));
    }
    return "";
});

const handleDelete = () => {
    if (props.imageFileCollection) {
        emit("deleteFileCollection", props.imageFileCollection);
    } else if (props.imageUploadData) {
        emit("deleteUploadData", props.imageUploadData);
    }
    showModal.value = false;
};

const cancelDelete = () => {
    showModal.value = false;
};
</script>

<template>
    <div>
        <div class="group relative" @mouseover="hover = true" @mouseleave="hover = false">
            <!-- Image Display -->
            <img
                v-if="!imageElementError"
                :srcset="srcset"
                class="h-16 w-16 rounded-sm shadow"
                @error="imageElementError = true"
                alt="Thumbnail preview"
            />
            <img
                v-else
                class="h-16 w-16 rounded-sm shadow"
                :src="fallbackImage"
                alt="Fallback image"
            />

            <!-- Delete Icon -->
            <TrashIcon
                v-show="hover"
                class="absolute -right-2 -top-2 z-10 h-5 w-5 cursor-pointer text-red-500"
                title="Delete file version"
                @click="showModal = true"
            />
        </div>

        <!-- Delete Confirmation Modal -->
        <LModal
            v-model:isVisible="showModal"
            heading="Delete file version"
            :description="deleteMessage"
            :primaryAction="handleDelete"
            primaryButtonText="Delete"
            :secondaryAction="cancelDelete"
            secondaryButtonText="Cancel"
            context="danger"
            v-on:close="showModal = false"
        />
    </div>
</template>
