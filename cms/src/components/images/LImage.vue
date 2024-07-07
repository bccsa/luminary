<script setup lang="ts">
// Image component with automatic aspect ratio selection and fallback image

import { computed, ref } from "vue";
import { type ImageDto } from "luminary-shared";

const props = defineProps<{
    image: ImageDto;
    aspectRatio: keyof typeof aspectRatios;
    size: keyof typeof sizes;
    baseUrl: string;
    fallbackImg: string;
}>();

const aspectRatios = {
    video: "aspect-video",
    square: "aspect-square",
    vertical: "aspect-[9/16]",
};

// Rounded to two decimal places
const aspectRatioNumbers = {
    video: 1.78,
    square: 1,
    vertical: 0.56,
};

const thumbnailSize: string = props.aspectRatio == "vertical" ? "w-40 md:w-60" : "h-40 md:h-60";
const sizes = {
    thumbnail: thumbnailSize,
    post: "w-full",
};

let closestAspectRatio = 0;

// Source set for the primary image element with the closest aspect ratio
const srcset1 = computed(() => {
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
                .map((f) => `${props.baseUrl}/${f.filename} ${f.width}w`)
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
                .map((f) => `${props.baseUrl}/${f.filename} ${f.width}w`)
                .join(", ");
        })
        .join(", ");
});

const imageElement1Error = ref(false);
const imageElement2Error = ref(false);

const showImageElement1 = computed(() => !imageElement1Error.value && srcset1.value != "");
const showImageElement2 = computed(() => !imageElement2Error.value && srcset2.value != "");
</script>

<template>
    <div
        :style="{ 'background-image': 'url(' + fallbackImg + ')' }"
        :class="[
            aspectRatios[aspectRatio],
            sizes[size],
            'overflow-clip bg-cover bg-center object-cover object-center',
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
            @onerror="imageElement1Error = true"
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
            @onerror="imageElement2Error = true"
        />
    </div>
</template>
