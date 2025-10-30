<script setup lang="ts">
import { type ContentParentDto, type DocType, type PostType, type TagType } from "luminary-shared";
import LCard from "../common/LCard.vue";
import { PhotoIcon } from "@heroicons/vue/24/solid";
import { QuestionMarkCircleIcon, ArrowUpOnSquareIcon } from "@heroicons/vue/24/outline";
import ImageEditor from "../images/ImageEditor.vue";
import { ref, computed } from "vue";
import LButton from "../button/LButton.vue";
import { useBucketSelection } from "@/composables/useBucketSelection";

type Props = {
    docType: DocType;
    tagOrPostType: TagType | PostType;
    disabled: boolean;
    newDocument?: boolean;
};
defineProps<Props>();

const parent = defineModel<ContentParentDto>("parent");
const showHelp = ref(false);

const imageEditorRef = ref<InstanceType<typeof ImageEditor> | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);

const bucketSelection = useBucketSelection();

// Check if bucket is selected (or auto-selected when only one exists)
const isBucketSelected = computed(() => {
    return !!parent.value?.imageBucketId;
});

// Get the selected bucket's fileTypes for the accept attribute
const acceptedFileTypes = computed(() => {
    if (!parent.value?.imageBucketId) {
        return "image/jpeg, image/png, image/webp"; // default
    }

    const bucket = bucketSelection.getBucketById(parent.value.imageBucketId);
    if (!bucket || !bucket.fileTypes || bucket.fileTypes.length === 0) {
        return "image/*"; // accept all images if no restrictions
    }

    // Convert fileTypes array to accept attribute format
    return bucket.fileTypes.join(", ");
});

const triggerFilePicker = () => {
    // Important: reset input so that selecting the same file again works
    if (uploadInput.value) {
        uploadInput.value.value = "";
    }

    uploadInput.value!.showPicker();
};

const handleFileChange = () => {
    const files = uploadInput.value?.files;
    if (files?.length && imageEditorRef.value?.handleFiles) {
        imageEditorRef.value.handleFiles(files);
        uploadInput.value!.value = ""; // reset input
    }
};
</script>

<template>
    <LCard
        v-if="parent"
        title="Image"
        :icon="PhotoIcon"
        :collapsed="newDocument ? false : true"
        collapsible
        class="bg-white"
    >
        <template #actions>
            <div>
                <LButton
                    :icon="ArrowUpOnSquareIcon"
                    size="base"
                    :disabled="disabled || !isBucketSelected"
                    @click.stop="triggerFilePicker"
                    :title="!isBucketSelected ? 'Please select a storage bucket first' : ''"
                >
                    <span class="block sm:hidden">Upload Image</span>
                    <span class="hidden text-sm sm:inline">Upload</span>
                </LButton>

                <input
                    ref="uploadInput"
                    type="file"
                    class="hidden"
                    :accept="acceptedFileTypes"
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
        <div v-if="showHelp">
            <p class="my-2 text-xs">
                You can upload several files in different aspect ratios. The most suitable image
                will automatically be displayed based on the aspect ratio of the image element where
                the image is displayed.
            </p>
            <p class="mb-2 text-xs">
                Uploaded images are automatically scaled for various screen and display sizes.
            </p>
        </div>
        <ImageEditor
            ref="imageEditorRef"
            :disabled="disabled"
            v-model:parent="parent"
            class="scrollbar-hide"
        />
    </LCard>
</template>
