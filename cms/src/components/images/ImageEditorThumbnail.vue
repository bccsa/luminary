<script setup lang="ts">
import { TrashIcon } from "@heroicons/vue/24/solid";
import { ref } from "vue";
import LModal from "@/components/common/LModal.vue";
import type { ImageFileDto } from "@/types";

type Props = {
    imageFile: ImageFileDto;
};
const props = defineProps<Props>();

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;

const emit = defineEmits<{
    (e: "delete", filename: string): void;
}>();

const hover = ref(false);
const showModal = ref(false);

const deleteFile = () => {
    emit("delete", props.imageFile.filename);
    showModal.value = false;
};

const cancelDelete = () => {
    showModal.value = false;
};

const deleteMessage = `Are you sure you want to delete the ${props.imageFile.width} x ${props.imageFile.height} file version?`;
</script>

<template>
    <div>
        <div class="group relative" @mouseover="hover = true" @mouseleave="hover = false">
            <label class="text-xs text-zinc-900"
                >{{ imageFile.width }} x {{ imageFile.height }}</label
            >
            <img :src="baseUrl + '/' + imageFile.filename" class="h-36 rounded shadow" />
            <TrashIcon
                class="absolute -right-2 top-2 h-5 w-5 cursor-pointer text-red-500"
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
