<script setup lang="ts">
// Image component with automatic aspect ratio selection and fallback image

import { computed, ref } from "vue";
import { type ImageDto } from "luminary-shared";
import fallbackImg from "../../assets/fallbackImage.webp";

const props = defineProps<{
    image: ImageDto;
    aspectRatio: keyof typeof aspectRatios;
    size: keyof typeof sizes;
}>();

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;

const aspectRatios = {
    video: "aspect-video",
    square: "aspect-square",
    vertical: "aspect-[9/16]",
    wide: "aspect-[18/9]",
};

// Rounded to two decimal places
const aspectRatioNumbers = {
    video: 1.78,
    square: 1,
    vertical: 0.56,
    wide: 2,
};

const sizes = {
    thumbnail: "w-36 md:w-52",
    post: "w-full",
};

let closestAspectRatio = 0;

// Source set for the primary image element with the closest aspect ratio
const srcset1 = computed(() => {
    // Check if there is uploaded image data available and return a blob URL
    if (props.image.uploadData && props.image.uploadData.length > 0) {
        return URL.createObjectURL(
            new Blob([props.image.uploadData[props.image.uploadData.length - 1].fileData], {
                type: "image/*",
            }),
        );
    }

    if (!props.image.fileCollections || props.image.fileCollections?.length == 0) return "";

    // Get the available aspect ratios
    const aspectRatios = props.image.fileCollections
        .map((collection) => collection.aspectRatio)
        .reduce((acc, cur) => {
            if (!acc.includes(cur)) acc.push(cur);
            return acc;
        }, [] as number[])
        .sort((a, b) => a - b);

    // Get the aspect ratio closest to the desired aspect ratio
    const desiredAspectRatio = aspectRatioNumbers[props.aspectRatio];
    closestAspectRatio = aspectRatios.reduce((acc, cur) => {
        return Math.abs(cur - desiredAspectRatio) < Math.abs(acc - desiredAspectRatio) ? cur : acc;
    }, aspectRatios[0]);

    return props.image.fileCollections
        .filter((collection) => collection.aspectRatio == closestAspectRatio)
        .map((collection) => {
            return collection.imageFiles
                .map((f) => `${baseUrl}/${f.filename} ${f.width}w`)
                .join(", ");
        })
        .join(", ");
});

// Source set for the secondary image element (used if the primary image element fails to load) with the non-preferred aspect ratios
const srcset2 = computed(() => {
    if (!props.image.fileCollections || props.image.fileCollections?.length == 0) return "";

    return props.image.fileCollections
        .filter((collection) => collection.aspectRatio != closestAspectRatio)
        .map((collection) => {
            return collection.imageFiles
                .map((f) => `${baseUrl}/${f.filename} ${f.width}w`)
                .join(", ");
        })
        .join(", ");
});

const imageElement1Error = ref(false);
const imageElement2Error = ref(false);

const showImageElement1 = computed(() => !imageElement1Error.value && srcset1.value != "");
const showImageElement2 = computed(
    () => imageElement1Error.value && !imageElement2Error.value && srcset2.value != "",
);
</script>

<template>
    <div :class="sizes[size]">
        <div
            :style="{ 'background-image': 'url(' + fallbackImg + ')' }"
            :class="[
                aspectRatios[aspectRatio],
                'w-full overflow-clip rounded-lg bg-cover bg-center object-cover shadow',
            ]"
        >
            <img
                v-if="showImageElement1"
                src=""
                :srcset="srcset1"
                :class="[
                    aspectRatios[aspectRatio],
                    sizes[size],
                    'bg-cover bg-center object-cover object-center',
                ]"
                alt=""
                data-test="image-element1"
                loading="lazy"
                @error="imageElement1Error = true"
            />
            <img
                v-if="showImageElement2"
                src=""
                :srcset="srcset2"
                :class="[
                    aspectRatios[aspectRatio],
                    sizes[size],
                    'bg-cover bg-center object-cover object-center',
                ]"
                alt=""
                data-test="image-element2"
                loading="lazy"
                @error="imageElement2Error = true"
            />
        </div>
        <slot></slot>
    </div>
</template>
