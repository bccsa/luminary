<script setup lang="ts">
import {
    type ContentParentDto,
    type DocType,
    type PostType,
    type TagType,
    maxMediaUploadFileSize,
} from "luminary-shared";
import LCard from "../common/LCard.vue";
import { QuestionMarkCircleIcon, ArrowUpOnSquareIcon, FilmIcon } from "@heroicons/vue/24/outline";
import { ref, computed } from "vue";
import LButton from "../button/LButton.vue";
import MediaEditor from "../media/MediaEditor.vue";

type Props = {
    docType: DocType;
    tagOrPostType: TagType | PostType;
    disabled: boolean;
    newDocument?: boolean;
};
defineProps<Props>();

const parent = defineModel<ContentParentDto>("parent");
const showHelp = ref(false);
const maxMediaUploadFileSizeMb = computed(() => maxMediaUploadFileSize.value / 1000000);

const mediaEditorRef = ref<InstanceType<typeof MediaEditor> | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);

const triggerFilePicker = () => {
    // Important: reset input so that selecting the same file again works
    if (uploadInput.value) {
        uploadInput.value.value = "";
    }

    uploadInput.value!.showPicker();
};

const handleFileChange = () => {
    const files = uploadInput.value?.files;
    if (files?.length && mediaEditorRef.value?.handleFiles) {
        // Only process the first file since we allow one media per language
        const fileList = new DataTransfer();
        fileList.items.add(files[0]);
        mediaEditorRef.value.handleFiles(fileList.files);
        uploadInput.value!.value = ""; // reset input
    }
};
</script>

<template>
    <LCard
        v-if="parent"
        title="Media"
        :icon="FilmIcon"
        :collapsed="newDocument ? false : true"
        collapsible
        class="bg-white"
    >
        <template #actions>
            <div>
                <LButton
                    :icon="ArrowUpOnSquareIcon"
                    size="base"
                    :disabled="disabled"
                    @click.stop="triggerFilePicker"
                    data-test="upload-button"
                >
                    <span class="block sm:hidden">Upload Audio</span>
                    <span class="hidden text-sm sm:inline">Upload</span>
                </LButton>

                <input
                    ref="uploadInput"
                    type="file"
                    class="hidden"
                    accept="audio/aac, audio/mp3, audio/opus, audio/wav, audio/x-wav"
                    @change="handleFileChange"
                />
            </div>
            <button
                class="flex cursor-pointer items-center gap-1 rounded-md"
                @click.stop="showHelp = !showHelp"
            >
                <QuestionMarkCircleIcon class="h-5 w-5" />
            </button>
        </template>
        <div v-if="showHelp">
            <p class="mb-2 text-xs">
                You can upload multiple audio files, one per language. Each language can have only
                one audio file. Uploading a new file for a language that already has audio will
                replace the existing file.
            </p>
            <p class="mb-2 text-xs">
                Supported formats: MP3, AAC, Opus, WAV.
                <br />Maximum file size: {{ maxMediaUploadFileSizeMb }}MB.
            </p>
        </div>
        <MediaEditor
            ref="mediaEditorRef"
            :disabled="disabled"
            v-model:parent="parent"
            class="scrollbar-hide"
        />
    </LCard>
</template>
