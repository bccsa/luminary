<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ArrowUpOnSquareIcon } from "@heroicons/vue/24/outline";
import type { AuthProviderDto, ContentParentDto } from "luminary-shared";
import LButton from "../button/LButton.vue";
import ImageEditor from "../images/ImageEditor.vue";
import { storageSelection } from "@/composables/storageSelection";

const props = defineProps<{
    provider: AuthProviderDto;
    disabled?: boolean;
}>();

const emit = defineEmits<{
    "update:iconOpacity": [value: number];
}>();

const imageEditorRef = ref<InstanceType<typeof ImageEditor> | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);
const storage = storageSelection();

// Track existing images bucket for proper display after bucket changes
const existingImagesBucketId = ref<string | undefined>(undefined);
watch(
    () => props.provider,
    (newProvider) => {
        if (newProvider?.imageBucketId && newProvider?.imageData?.fileCollections?.length) {
            if (!existingImagesBucketId.value) {
                existingImagesBucketId.value = newProvider.imageBucketId;
            }
        }
        if (!newProvider?.imageData?.fileCollections?.length) {
            existingImagesBucketId.value = undefined;
        }
    },
    { immediate: true },
);

const isBucketSelected = computed(() => !!props.provider?.imageBucketId);

const acceptedMimeTypes = computed(() => {
    if (!props.provider?.imageBucketId) {
        return "image/jpeg, image/png, image/webp";
    }
    const bucket = storage.getBucketById(props.provider.imageBucketId);
    if (!bucket || !bucket.mimeTypes || bucket.mimeTypes.length === 0) {
        return "image/*";
    }
    return bucket.mimeTypes.join(", ");
});

const triggerFilePicker = () => {
    if (uploadInput.value) {
        uploadInput.value.value = "";
    }
    uploadInput.value?.showPicker();
};

const handleFileChange = () => {
    const files = uploadInput.value?.files;
    if (files?.length && imageEditorRef.value?.handleFiles) {
        imageEditorRef.value.handleFiles(files);
        uploadInput.value!.value = "";
    }
};

// Local ref for the slider so dragging doesn't mutate `provider` on every pixel.
// The display label reads this; the actual provider update fires only on @change.
const localOpacity = ref(props.provider.iconOpacity ?? 1);
watch(
    () => props.provider.iconOpacity,
    (v) => {
        localOpacity.value = v ?? 1;
    },
);
</script>

<template>
    <div class="rounded-md border border-zinc-200 bg-white p-2">
        <div class="mb-1 flex items-center justify-between">
            <label class="block text-xs font-medium text-gray-700">Icon</label>
            <LButton
                v-if="isBucketSelected"
                :icon="ArrowUpOnSquareIcon"
                size="sm"
                variant="tertiary"
                :disabled="disabled || !isBucketSelected"
                @click.stop="triggerFilePicker"
            >
                Upload
            </LButton>
            <input
                ref="uploadInput"
                type="file"
                class="hidden"
                :accept="acceptedMimeTypes"
                @change="handleFileChange"
            />
        </div>
        <div class="rounded-md border border-gray-200 bg-white p-2">
            <ImageEditor
                ref="imageEditorRef"
                v-model:parent="provider as unknown as ContentParentDto"
                :disabled="disabled ?? false"
                :existing-images-bucket-id="existingImagesBucketId"
                @bucket-selected="() => {}"
            />
        </div>
        <div class="mt-2">
            <label for="icon-opacity" class="mb-1 block text-xs font-medium text-gray-700">
                Icon transparency
            </label>
            <div class="flex items-center gap-2">
                <input
                    id="icon-opacity"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    :value="localOpacity"
                    class="h-2 w-full flex-1 cursor-pointer appearance-none rounded-lg bg-gray-200 accent-gray-700"
                    :disabled="disabled"
                    @input="localOpacity = ($event.target as HTMLInputElement).valueAsNumber"
                    @change="
                        emit(
                            'update:iconOpacity',
                            ($event.target as HTMLInputElement).valueAsNumber,
                        )
                    "
                />
                <span class="w-10 text-right text-xs text-gray-600">
                    {{ Math.round(localOpacity * 100) }}%
                </span>
            </div>
        </div>
    </div>
</template>
