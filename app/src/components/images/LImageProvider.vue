<script setup lang="ts">
import { fallbackImageUrls, getConnectionSpeed } from "@/globalConfig";
import {
    isConnected,
    type ImageDto,
    type ImageFileCollectionDto,
    type ImageFileDto,
    type Uuid,
} from "luminary-shared";
import Rand from "rand-seed";
import { computed, onBeforeMount, ref } from "vue";

type Props = {
    image?: ImageDto;
    aspectRatio?: keyof typeof aspectRatiosCSS;
    size?: keyof typeof sizes;
    rounded?: boolean;
    parentWidth: number;
    parentId: Uuid;
    highQuality?: boolean; // New prop for zoom mode
};

const aspectRatiosCSS = {
    video: "aspect-video",
    square: "aspect-square",
    vertical: "aspect-[9/16]",
    wide: "aspect-[18/9]",
    classic: "aspect-[4/3]",
};

const aspectRatioNumbers = {
    video: 1.78,
    square: 1,
    vertical: 0.56,
    wide: 2,
    classic: 1.33,
};

const sizes = {
    small: "w-20 max-w-20 min-w-20 md:w-24 md:max-w-24 md:min-w-24",
    thumbnail: "w-36 max-w-36 min-w-36 md:w-52 md:max-w-52 md:min-w-52",
    post: "w-full max-w-full",
};

const props = withDefaults(defineProps<Props>(), {
    aspectRatio: "video",
    size: "post",
    rounded: true,
    highQuality: false, // Default to normal quality filtering
});

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;

let closestAspectRatio = 0;

const connectionSpeed = getConnectionSpeed();
const isDesktop = window.innerWidth >= 768;

const calcImageLoadingTime = (imageFile: ImageFileDto) => {
    // This calculation is using data from https://developers.google.com/speed/webp/docs/webp_study calculated to an average size per pixel for webp images comparable to JPEG Q=75 images.
    const sizePerPixel = 0.0000000368804; // 9.9 KB / (512 x 512 pixels) = 0.00966797 MB / 262144 pixels = 3.68804E-08 MB per pixel
    const imageFileSize = imageFile.width * imageFile.height * sizePerPixel;
    return imageFileSize / (connectionSpeed / 8); // Convert connection speed from Mbps to MBps
};

// Filter out images that would take more than 1 second to load on mobile devices or that are bigger than the parent element width plus 50%
// In high quality mode (zoom), bypass most filtering to get the best available images
const filteredFileCollections = computed(() => {
    const res: Array<ImageFileCollectionDto> = [];
    if (!props.image?.fileCollections) return res;

    props.image.fileCollections.forEach((collection) => {
        let images: ImageFileDto[];

        if (props.highQuality) {
            // In high quality mode, allow longer loading times to get better quality images
            images = collection.imageFiles.filter(
                (imgFile) =>
                    !isConnected || // Bypass filtering when not connected
                    calcImageLoadingTime(imgFile) < 2, // Allow 2 seconds loading time for zooming to get better quality images
            );
        } else {
            // Normal filtering for regular display
            images = collection.imageFiles.filter(
                (imgFile) =>
                    !isConnected || // Bypass filtering when not connected
                    ((isDesktop || calcImageLoadingTime(imgFile) < 1) && // Connection speed detection is not reliable on desktop
                        imgFile.width <= (props.parentWidth * 1.5 || 180)),
            );
        }

        // add the smallest image from collection.imageFiles to images if images is empty
        if (images.length == 0) {
            if (collection.imageFiles.length == 0) return;
            images.push(collection.imageFiles.reduce((a, b) => (a.width < b.width ? a : b)));
        }

        res.push({
            ...collection,
            imageFiles: images,
        });
    });

    return res;
});

// Source set for the primary image element with the closest aspect ratio
const srcset1 = computed(() => {
    if (props.image?.uploadData && props.image.uploadData.length > 0) {
        return URL.createObjectURL(
            new Blob([props.image.uploadData[props.image.uploadData.length - 1].fileData], {
                type: "image/*",
            }),
        );
    }

    if (!filteredFileCollections.value.length) return "";

    const aspectRatios = filteredFileCollections.value
        .map((collection) => collection.aspectRatio)
        .reduce((acc, cur) => {
            if (!acc.includes(cur)) acc.push(cur);
            return acc;
        }, [] as number[])
        .sort((a, b) => a - b);

    const desiredAspectRatio = aspectRatioNumbers[props.aspectRatio];
    closestAspectRatio = aspectRatios.reduce((acc, cur) => {
        return Math.abs(cur - desiredAspectRatio) < Math.abs(acc - desiredAspectRatio) ? cur : acc;
    }, aspectRatios[0]);

    return filteredFileCollections.value
        .filter((collection) => collection.aspectRatio == closestAspectRatio)
        .map((collection) => {
            return collection.imageFiles
                .sort((a, b) => a.width - b.width)
                .map((f) => `${baseUrl}/${f.filename} ${f.width}w`)
                .join(", ");
        })
        .join(", ");
});

// Source set for the secondary image element (used if the primary image element fails to load)
const srcset2 = computed(() => {
    if (!props.image?.fileCollections || props.image.fileCollections?.length == 0) return "";
    return props.image.fileCollections
        .filter((collection) => collection.aspectRatio != closestAspectRatio)
        .map((collection) => {
            let images = collection.imageFiles.filter(
                (imgFile) => imgFile.width <= props.parentWidth,
            );
            if (images.length === 0 && collection.imageFiles.length > 0) {
                images = [collection.imageFiles.reduce((a, b) => (a.width < b.width ? a : b))];
            }
            return images
                .sort((a, b) => a.width - b.width)
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

const fallbackImageUrl = ref<string | undefined>(undefined);

const loadFallbackImage = async () => {
    const randomImage = (await fallbackImageUrls)[
        Math.floor(new Rand(props.parentId).next() * (await fallbackImageUrls).length)
    ] as string;
    fallbackImageUrl.value = randomImage;
};

onBeforeMount(async () => {
    await loadFallbackImage();
});
</script>

<template>
    <img
        v-if="srcset1 && showImageElement1"
        :srcset="srcset1"
        :class="[
            aspectRatiosCSS[aspectRatio],
            sizes[size],
            'bg-cover bg-center object-cover object-center',
        ]"
        alt=""
        data-test="image-element1"
        loading="lazy"
        @error="imageElement1Error = true"
        draggable="false"
    />
    <img
        v-else-if="showImageElement2 && srcset2"
        src=""
        :srcset="srcset2"
        :class="[
            aspectRatiosCSS[aspectRatio],
            sizes[size],
            'bg-cover bg-center object-cover object-center',
        ]"
        alt=""
        data-test="image-element2"
        loading="lazy"
        @error="imageElement2Error = true"
        draggable="false"
    />
    <img
        v-else
        :src="fallbackImageUrl"
        :class="[
            aspectRatiosCSS[aspectRatio],
            sizes[size],
            'bg-cover bg-center object-cover object-center',
        ]"
        alt=""
        data-test="image-element2"
        loading="lazy"
        @error="imageElement2Error = true"
        draggable="false"
        :key="parentId"
    />
</template>
