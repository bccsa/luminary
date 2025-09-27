<script setup lang="ts">
import { TrashIcon, MusicalNoteIcon } from "@heroicons/vue/24/solid";
import { computed, ref } from "vue";
import LDialog from "@/components/common/LDialog.vue";
import type { MediaFileDto, MediaUploadDataDto } from "luminary-shared";

type Props = {
    mediaFile?: MediaFileDto;
    mediaUploadData?: MediaUploadDataDto;
    disabled?: boolean;
};
const props = defineProps<Props>();

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;

const src = computed(() => {
    if (!props.mediaUploadData) return "";

    // If it’s already uploaded and has a fileUrl → preview from server
    if ((props.mediaUploadData as any).fileUrl) {
        console.log(`${baseUrl}/${(props.mediaUploadData as any).fileUrl}`);
        return `${baseUrl}/${(props.mediaUploadData as any).fileUrl}`;
    }

    // Otherwise it’s a new upload (ArrayBuffer preview)
    if (props.mediaUploadData.fileData) {
        return URL.createObjectURL(new Blob([props.mediaUploadData.fileData]));
    }

    return "";
});

const emit = defineEmits<{
    (e: "deleteFileCollection", imageFileCollection: MediaFileDto): void;
    (e: "deleteUploadData", mediaUploadData: MediaUploadDataDto): void;
}>();

const hover = ref(false);
const showModal = ref(false);

const deleteFile = () => {
    if (props.mediaFile) {
        emit("deleteFileCollection", props.mediaFile);
    }

    if (props.mediaUploadData) {
        emit("deleteUploadData", props.mediaUploadData);
    }

    showModal.value = false;
};

const cancelDelete = () => {
    showModal.value = false;
};

const deleteMessage = `Are you sure you want to delete the audio file?`;

const mediaElementError = ref(false);
</script>

<template>
    <div :class="$attrs.class">
        <div class="group relative" @mouseover="hover = true" @mouseleave="hover = false">
            <audio
                v-if="!mediaElementError"
                :src="src"
                controls
                download="false"
                class="h-16 rounded-sm shadow"
                @error="mediaElementError = true"
            />

            <!-- Fallback icon if preview fails -->
            <div
                v-else
                class="flex h-16 w-16 items-center justify-center rounded-sm bg-gray-100 shadow"
            >
                <MusicalNoteIcon class="h-8 w-8 text-gray-500" />
            </div>

            <TrashIcon
                class="absolute -right-2 -top-2 h-5 w-5 cursor-pointer text-red-500"
                v-show="hover && disabled"
                title="Delete file version"
                @click="showModal = true"
            />
        </div>
    </div>
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
