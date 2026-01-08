<script setup lang="ts">
import { type ContentParentDto, type DocType, type PostType, type TagType } from "luminary-shared";
import LCard from "../common/LCard.vue";
import { PhotoIcon } from "@heroicons/vue/24/solid";
import { QuestionMarkCircleIcon, ArrowUpOnSquareIcon } from "@heroicons/vue/24/outline";
import ImageEditor from "../images/ImageEditor.vue";
import { ref, computed, watch } from "vue";
import LButton from "../button/LButton.vue";
import { storageSelection } from "@/composables/storageSelection";

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

const storage = storageSelection();

// Track the existing images bucket ID to handle bucket changes properly
const existingImagesBucketId = ref<string | undefined>(undefined);

// Initialize existingImagesBucketId when component loads with existing images
watch(
    () => parent.value,
    (newParent) => {
        if (newParent?.imageBucketId && newParent?.imageData?.fileCollections?.length) {
            // If we don't have an existingImagesBucketId yet, and there are existing images,
            // set it to the current imageBucketId (this represents where the images are actually stored)
            if (!existingImagesBucketId.value) {
                existingImagesBucketId.value = newParent.imageBucketId;
            }
        }

        // If no images exist, clear the existing bucket reference
        if (!newParent?.imageData?.fileCollections?.length) {
            existingImagesBucketId.value = undefined;
        }
    },
    { immediate: true },
);

// Check if bucket is selected (or auto-selected when only one exists)
const isBucketSelected = computed(() => {
    return !!parent.value?.imageBucketId;
});

// Get the selected bucket's mimeTypes for the accept attribute
const acceptedmimeTypes = computed(() => {
    if (!parent.value?.imageBucketId) {
        return "image/jpeg, image/png, image/webp"; // default
    }

    const bucket = storage.getBucketById(parent.value.imageBucketId);
    if (!bucket || !bucket.mimeTypes || bucket.mimeTypes.length === 0) {
        return "image/*"; // accept all images if no restrictions
    }

    // Convert mimeTypes array to accept attribute format
    return bucket.mimeTypes.join(", ");
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
                    v-if="isBucketSelected"
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
                    :accept="acceptedmimeTypes"
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
            :existing-images-bucket-id="existingImagesBucketId"
            v-model:parent="parent"
            class="scrollbar-hide"
            @bucket-selected="() => {}"
        />
    </LCard>
</template>
