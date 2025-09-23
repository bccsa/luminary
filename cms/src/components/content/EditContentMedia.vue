<script setup lang="ts">
import { type ContentParentDto, type DocType, type PostType, type TagType } from "luminary-shared";
import LCard from "../common/LCard.vue";
import { QuestionMarkCircleIcon, ArrowUpOnSquareIcon, FilmIcon } from "@heroicons/vue/24/outline";
import { ref } from "vue";
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
        mediaEditorRef.value.handleFiles(files);
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
                >
                    <span class="block sm:hidden">Upload Audio</span>
                    <span class="hidden text-sm sm:inline">Upload</span>
                </LButton>

                <input
                    ref="uploadInput"
                    type="file"
                    class="hidden"
                    accept="audio/aac, audio/mp3, audio/opus"
                    multiple
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
        <!-- <div v-if="showHelp">
            <p class="my-2 text-xs">
                You can upload several files in different aspect ratios. The most suitable image
                will automatically be displayed based on the aspect ratio of the image element where
                the image is displayed.
            </p>
            <p class="mb-2 text-xs">
                Uploaded images are automatically scaled for various screen and display sizes.
            </p>
        </div> -->
        <MediaEditor
            ref="mediaEditorRef"
            :disabled="disabled"
            v-model:parent="parent"
            class="scrollbar-hide"
        />
    </LCard>
</template>
