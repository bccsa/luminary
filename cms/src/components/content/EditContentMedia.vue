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
    embedded?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    embedded: false,
});

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
    <div v-if="parent">
        <LCard
            v-if="!props.embedded"
            title="Media"
            :icon="FilmIcon"
            :collapsed="newDocument ? false : true"
            collapsible
            class="bg-white dark:bg-slate-800"
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
                    class="flex cursor-pointer items-center gap-1 rounded-md text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                    @click.stop="showHelp = !showHelp"
                >
                    <QuestionMarkCircleIcon class="h-5 w-5" />
                </button>
            </template>
            <div v-if="showHelp" class="text-zinc-600 dark:text-zinc-400">
                <p class="mb-2 text-xs">
                    You can upload multiple audio files, one per language. Each language can have
                    only one audio file. Uploading a new file for a language that already has audio
                    will replace the existing file.
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

        <div v-else>
            <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                    <FilmIcon class="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
                    <h3 class="text-sm font-medium leading-6 text-zinc-900 dark:text-yellow-400">
                        Media
                    </h3>
                </div>
                <div class="flex items-center gap-2">
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
                    <button
                        class="flex cursor-pointer items-center gap-1 rounded-md text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                        @click.stop="showHelp = !showHelp"
                        aria-label="Media help"
                        type="button"
                    >
                        <QuestionMarkCircleIcon class="h-5 w-5" />
                    </button>
                </div>
            </div>

            <input
                ref="uploadInput"
                type="file"
                class="hidden"
                accept="audio/aac, audio/mp3, audio/opus, audio/wav, audio/x-wav"
                @change="handleFileChange"
            />

            <div v-if="showHelp" class="mt-2 text-zinc-600 dark:text-zinc-400">
                <p class="mb-2 text-xs">
                    You can upload multiple audio files, one per language. Each language can have
                    only one audio file. Uploading a new file for a language that already has audio
                    will replace the existing file.
                </p>
                <p class="mb-2 text-xs">
                    Supported formats: MP3, AAC, Opus, WAV.
                    <br />Maximum file size: {{ maxMediaUploadFileSizeMb }}MB.
                </p>
            </div>

            <div class="mt-2">
                <MediaEditor
                    ref="mediaEditorRef"
                    :disabled="disabled"
                    v-model:parent="parent"
                    class="scrollbar-hide"
                />
            </div>
        </div>
    </div>
</template>
