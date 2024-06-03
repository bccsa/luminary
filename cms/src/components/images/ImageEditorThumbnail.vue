<script setup lang="ts">
import { TrashIcon } from "@heroicons/vue/24/solid";
import { computed, ref } from "vue";
import LModal from "@/components/common/LModal.vue";
import type { ImageFileCollectionDto, ImageFileDto } from "@/types";

type Props = {
    imageFileCollection: ImageFileCollectionDto;
};
const props = defineProps<Props>();
const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;

const srcset = computed(() => {
    return props.imageFileCollection.imageFiles
        .map((f) => `${baseUrl}/${f.filename} ${f.width}w`)
        .join(", ");
});

const emit = defineEmits<{
    (e: "delete", imageFileCollection: ImageFileCollectionDto): void;
}>();

const hover = ref(false);
const showModal = ref(false);

const deleteFile = () => {
    emit("delete", props.imageFileCollection);
    showModal.value = false;
};

const cancelDelete = () => {
    showModal.value = false;
};

const deleteMessage = `Are you sure you want to delete this file version?`;
</script>

<template>
    <div>
        <div class="group relative" @mouseover="hover = true" @mouseleave="hover = false">
            <img :srcset="srcset" class="h-36 rounded shadow" />
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
