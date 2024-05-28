<script setup lang="ts">
// Image component with automatic aspect ratio selection and fallback image

import { ref, watch } from "vue";
import { db } from "@/db/baseDatabase";
import { type ImageDto, type Uuid } from "@/types";

const props = defineProps<{
    imageId: Uuid;
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

const sizes = {
    thumbnail: "w-40 overflow-clip md:w-60",
    post: "w-full",
};

const image = db.getAsRef<ImageDto>(props.imageId);
const imgElement = ref<HTMLImageElement | undefined>(undefined);
const imgElement2 = ref<HTMLImageElement | undefined>(undefined); // imgElement2 serves as a fallback image element should the preferred aspect ratio not be available / cached

let closestAspectRatio = 0;
// Start watching for image object changes once the image elements are loaded
watch(
    imgElement2,
    () => {
        // We are determining which image to display in a watch function as the image document loaded from IndexedDB is not available immediately
        watch(
            image,
            (img) => {
                if (!img) return;

                // Set the image source to the uploaded file
                if (img.uploadData && img.uploadData[0]) {
                    const blobUrl = URL.createObjectURL(new Blob([img.uploadData[0].fileData]));
                    imgElement.value!.src = blobUrl;
                    imgElement.value!.hidden = false;
                    imgElement2.value!.hidden = true;
                    imgElement2.value!.src = "";
                    imgElement2.value!.srcset = "";
                    return;
                }

                if (!img || !img.files || img.files.length == 0) {
                    imgElement.value!.hidden = true;
                    imgElement.value!.src = "";
                    imgElement.value!.srcset = "";
                    imgElement2.value!.hidden = true;
                    imgElement2.value!.src = "";
                    imgElement2.value!.srcset = "";
                    return;
                }

                // Set image source
                if (img.files[0]) {
                    // Get the available aspect ratios
                    const aspectRatios = img.files
                        .map((file) => file.aspectRatio)
                        .reduce((acc, cur) => {
                            if (!acc.includes(cur)) acc.push(cur);
                            return acc;
                        }, [] as number[])
                        .sort((a, b) => a - b);

                    // Get the aspect ratio closest to the desired aspect ratio
                    const desiredAspectRatio = aspectRatioNumbers[props.aspectRatio];
                    closestAspectRatio = aspectRatios.reduce((acc, cur) => {
                        return Math.abs(cur - desiredAspectRatio) <
                            Math.abs(acc - desiredAspectRatio)
                            ? cur
                            : acc;
                    }, aspectRatios[0]);

                    // Get the images with the closest aspect ratio
                    const sorted = img.files
                        .filter((file) => file.aspectRatio == closestAspectRatio)
                        .sort((a, b) => a.width - b.width);

                    if (!imgElement.value?.onerror) imgElement.value!.onerror = onError; // only set onerror when the source is set to prevent premature triggering
                    imgElement.value!.src = props.baseUrl + "/" + sorted[0].filename;

                    let srcset = "";
                    for (const file of sorted) {
                        srcset += `${props.baseUrl}/${file.filename} ${file.width}w, `;
                    }
                    imgElement.value!.srcset = srcset;
                    imgElement.value!.hidden = false;

                    return;
                }
            },
            { immediate: true },
        );
    },
    { once: true },
);

const onError = () => {
    imgElement.value!.hidden = true; // Hide the image element if the image fails to load

    // Include the other aspect ratios as fallbacks
    const sorted2 = image.value.files
        .filter((file) => file.aspectRatio != closestAspectRatio)
        .sort((a, b) => a.width - b.width);

    if (sorted2.length > 0) {
        if (!imgElement2.value?.onerror) imgElement2.value!.onerror = onError2; // only set onerror when the source is set to prevent premature triggering
        imgElement2.value!.src = props.baseUrl + "/" + sorted2[0].filename;
        let srcset2 = "";
        for (const file of sorted2) {
            srcset2 += `${props.baseUrl}/${file.filename} ${file.width}w, `;
        }
        imgElement2.value!.srcset = srcset2;
        imgElement2.value!.hidden = false;

        return;
    }

    imgElement2.value!.hidden = true;
    imgElement2.value!.src = "";
    imgElement2.value!.srcset = "";
};

const onError2 = () => {
    imgElement2.value!.hidden = true; // Hide the image element if the image fails to load. The fallback image should now show (set as the CSS background image)
};
</script>

<template>
    <div
        :style="{ 'background-image': 'url(' + fallbackImg + ')' }"
        :class="[
            aspectRatios[aspectRatio],
            sizes[size],
            'bg-cover bg-center object-cover object-center',
        ]"
    >
        <img
            ref="imgElement"
            src=""
            hidden
            :class="[
                aspectRatios[aspectRatio],
                sizes[size],
                'bg-cover bg-center object-cover object-center',
            ]"
            alt=""
            data-test="image-element1"
            loading="lazy"
        />
        <img
            ref="imgElement2"
            src=""
            hidden
            :class="[
                aspectRatios[aspectRatio],
                sizes[size],
                'bg-cover bg-center object-cover object-center',
            ]"
            alt=""
            data-test="image-element2"
            loading="lazy"
        />
    </div>
</template>
