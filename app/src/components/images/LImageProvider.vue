<script setup lang="ts">
import { fallbackImageUrls, getConnectionSpeed } from "@/globalConfig";
import { getCachedImageUrl, preloadImages } from "@/util/imageCache";
import {
    isConnected,
    type ImageDto,
    type ImageFileCollectionDto,
    type ImageFileDto,
    type Uuid,
} from "luminary-shared";
import Rand from "rand-seed";
import { computed, onBeforeMount, ref, watch } from "vue";

type Props = {
    image?: ImageDto;
    aspectRatio?: keyof typeof aspectRatiosCSS;
    size?: keyof typeof sizes;
    rounded?: boolean;
    parentWidth: number;
    parentId: Uuid;
    isModal?: boolean;
};

const aspectRatiosCSS = {
    original: "aspect-auto",
    video: "aspect-video",
    square: "aspect-square",
    vertical: "aspect-[9/16]",
    wide: "aspect-[18/9]",
    classic: "aspect-[4/3]",
};

const aspectRatioNumbers = {
    original: 0, // placeholder for type safety, not used in calculations
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
    isModal: false,
});

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;

const connectionSpeed = getConnectionSpeed();
const isDesktop = window.innerWidth >= 768;

const calcImageLoadingTime = (imageFile: ImageFileDto) => {
    // This calculation is using data from https://developers.google.com/speed/webp/docs/webp_study calculated to an average size per pixel for webp images comparable to JPEG Q=75 images.
    const sizePerPixel = 0.0000000368804; // 9.9 KB / (512 x 512 pixels) = 0.00966797 MB / 262144 pixels = 3.68804E-08 MB per pixel
    const imageFileSize = imageFile.width * imageFile.height * sizePerPixel;
    return imageFileSize / (connectionSpeed / 8); // Convert connection speed from Mbps to MBps
};

// Filter out images that would take more than 1 second to load on mobile devices or that are bigger than the parent element width plus 50%
const filteredFileCollections = computed(() => {
    const res: Array<ImageFileCollectionDto> = [];
    if (!props.image?.fileCollections) return res;

    // When displayed in a modal, we should not filter the images based on size
    // to ensure high quality on zoom.
    if (props.isModal) return props.image.fileCollections;

    props.image.fileCollections.forEach((collection) => {
        const images = collection.imageFiles.filter(
            (imgFile) =>
                !isConnected || // Bypass filtering when not connected, allowing the image element to select any available image from cache
                ((isDesktop || calcImageLoadingTime(imgFile) < 1) && // Connection speed detection is not reliable on desktop
                    imgFile.width <= (props.parentWidth * 1.5 || 180)),
        );

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

// Calculate the closest aspect ratio to the desired one
const closestAspectRatio = computed(() => {
    if (!filteredFileCollections.value.length) return 0;

    // In modal mode, don't filter by aspect ratio - use the first available
    if (props.isModal && filteredFileCollections.value.length > 0) {
        return filteredFileCollections.value[0].aspectRatio;
    }

    const aspectRatios = filteredFileCollections.value
        .map((collection) => collection.aspectRatio)
        .reduce((acc, cur) => {
            if (!acc.includes(cur)) acc.push(cur);
            return acc;
        }, [] as number[])
        .sort((a, b) => a - b);

    const desiredAspectRatio = aspectRatioNumbers[props.aspectRatio];
    return aspectRatios.reduce((acc, cur) => {
        return Math.abs(cur - desiredAspectRatio) < Math.abs(acc - desiredAspectRatio) ? cur : acc;
    }, aspectRatios[0]);
});

// Source set for the primary image element with the closest aspect ratio
const srcset1 = computed(() => {
    if (!props.image?.fileCollections?.length) return "";

    // When offline, include all possible images so browser can use any cached version
    if (!isConnected.value) {
        return props.image.fileCollections
            .flatMap((collection) => collection.imageFiles)
            .sort((a, b) => a.width - b.width)
            .map((f) => `${baseUrl}/${f.filename} ${f.width}w`)
            .join(", ");
    }

    const collectionsToUse = filteredFileCollections.value.filter(
        (collection) => collection.aspectRatio === closestAspectRatio.value,
    );

    if (!collectionsToUse.length) return "";

    // Filter images by parent width.
    collectionsToUse.forEach((collection) => {
        // Use a fallback width if parentWidth is 0 (e.g. before DOM is mounted or measured).
        // 400 is a conservative default that avoids excluding all images due to 0 width,
        // and works well across mobile, modal, and early-render scenarios.
        const effectiveWidth = props.parentWidth > 0 ? props.parentWidth : 400;

        collection.imageFiles = collection.imageFiles.filter(
            (img) => img.width <= effectiveWidth + effectiveWidth * 0.5,
        );

        // If no image files are left after filtering, include the smallest image as a fallback
        if (!collection.imageFiles.length && props.image) {
            const originalCollection = props.image.fileCollections.find(
                (c) => c.aspectRatio === collection.aspectRatio,
            );
            if (originalCollection) {
                const smallestImage = originalCollection.imageFiles.reduce((a, b) =>
                    a.width < b.width ? a : b,
                );
                collection.imageFiles = [smallestImage];
            }
        }
    });

    return collectionsToUse
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
    if (!props.image?.fileCollections?.length) return "";

    // When offline, include all possible images so browser can use any cached version
    if (!isConnected.value) {
        return props.image.fileCollections
            .flatMap((collection) => collection.imageFiles)
            .sort((a, b) => a.width - b.width)
            .map((f) => `${baseUrl}/${f.filename} ${f.width}w`)
            .join(", ");
    }

    // Use a fallback width if parentWidth is 0 (e.g. before DOM is mounted or measured).
    // 400 is a conservative default that avoids excluding all images due to 0 width,
    // and works well across mobile, modal, and early-render scenarios.
    const effectiveWidth = props.parentWidth > 0 ? props.parentWidth : 400;

    return props.image.fileCollections
        .filter((collection) => collection.aspectRatio !== closestAspectRatio.value)
        .map((collection) => {
            const images = collection.imageFiles.filter((img) => img.width <= effectiveWidth);
            // fallback: smallest image if all are too large
            const files = images.length
                ? images
                : [collection.imageFiles.reduce((a, b) => (a.width < b.width ? a : b))];
            return files.map((f) => `${baseUrl}/${f.filename} ${f.width}w`).join(", ");
        })
        .join(", ");
});

const imageElement1Error = ref(false);
const imageElement2Error = ref(false);

// Cached image URLs for offline use
const cachedImageUrl1 = ref<string | null>(null);
const cachedImageUrl2 = ref<string | null>(null);

// Function to extract URLs from srcset
const extractUrlsFromSrcset = (srcset: string): string[] => {
    return srcset
        .split(", ")
        .map((item) => {
            const parts = item.trim().split(" ");
            return parts[0]; // First part is the URL
        })
        .filter((url) => url && url.includes("/")); // Any URL with a path
};

// Preload images when online and get cached versions when offline
const setupImageCaching = async () => {
    if (isConnected.value) {
        // When online, preload images for caching
        const urls1 = extractUrlsFromSrcset(srcset1.value);
        const urls2 = extractUrlsFromSrcset(srcset2.value);

        if (urls1.length > 0) preloadImages(urls1);
        if (urls2.length > 0) preloadImages(urls2);
    } else {
        // When offline, try to get cached versions
        const urls1 = extractUrlsFromSrcset(srcset1.value);
        const urls2 = extractUrlsFromSrcset(srcset2.value);

        if (urls1.length > 0) {
            cachedImageUrl1.value = await getCachedImageUrl(urls1);
        }
        if (urls2.length > 0) {
            cachedImageUrl2.value = await getCachedImageUrl(urls2);
        }
    }
};

const showImageElement1 = computed(() => {
    if (!isConnected.value && cachedImageUrl1.value) return true;
    return props.aspectRatio != "original" && !imageElement1Error.value && srcset1.value != "";
});
const showImageElement2 = computed(() => {
    if (!isConnected.value && cachedImageUrl2.value) return true;
    return (
        (props.aspectRatio == "original" || imageElement1Error.value) &&
        !imageElement2Error.value &&
        srcset2.value != ""
    );
});

const fallbackImageUrl = ref<string | undefined>(undefined);

const loadFallbackImage = async () => {
    const randomImage = (await fallbackImageUrls)[
        Math.floor(new Rand(props.parentId).next() * (await fallbackImageUrls).length)
    ] as string;
    fallbackImageUrl.value = randomImage;
};

onBeforeMount(async () => {
    await loadFallbackImage();
    await setupImageCaching();
});

// Watch for changes in connection state or srcsets
watch([isConnected, srcset1, srcset2], async () => {
    await setupImageCaching();
});

// In modal mode we want the largest available original image (no aspect ratio coercion)
const modalSrc = computed(() => {
    // If we have local upload data (e.g. unsaved/new image), prefer the last blob (likely highest quality)
    if (props.isModal && props.image?.uploadData?.length) {
        return URL.createObjectURL(
            new Blob([props.image.uploadData[props.image.uploadData.length - 1].fileData], {
                type: "image/*",
            }),
        );
    }
    if (!props.isModal) return undefined;
    const allFiles = (props.image?.fileCollections?.flatMap((fc) => fc.imageFiles) ||
        []) as ImageFileDto[];
    if (!allFiles.length) return fallbackImageUrl.value;
    // Pick the file with the largest area (width * height) to preserve detail for zooming
    const largest = allFiles.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
    return `${baseUrl}/${largest.filename}`;
});

// Build a full srcset for modal mode so tests (and the browser) can still pick optimal sizes
const modalSrcset = computed(() => {
    if (!props.isModal) return "";
    // If using uploadData blob, we cannot build a srcset of different widths
    if (props.image?.uploadData?.length) return "";
    const files = (props.image?.fileCollections?.flatMap((fc) => fc.imageFiles) || [])
        .slice()
        .sort((a, b) => a.width - b.width);
    if (!files.length) return "";
    return files.map((f) => `${baseUrl}/${f.filename} ${f.width}w`).join(", ");
});
</script>

<template>
    <!-- Modal mode: single <img> honoring natural dimensions (no forced aspect ratio) -->
    <img
        v-if="isModal && modalSrc"
        :src="modalSrc"
        :srcset="modalSrcset || undefined"
        :alt="''"
        class="h-auto max-h-[90vh] w-auto max-w-[90vw] select-none object-contain"
        draggable="false"
        data-test="image-element1"
    />
    <img
        v-else-if="isModal && !modalSrc && fallbackImageUrl"
        :src="fallbackImageUrl"
        :alt="''"
        class="h-auto max-h-[90vh] w-auto max-w-[90vw] select-none object-contain"
        draggable="false"
        data-test="image-element1"
    />
    <!-- Non-modal mode (original logic with responsive srcset & aspect ratio handling) -->
    <img
        v-else-if="srcset1 && showImageElement1"
        :srcset="!isConnected && cachedImageUrl1 ? undefined : srcset1"
        :src="!isConnected && cachedImageUrl1 ? cachedImageUrl1 : undefined"
        :class="[
            !isModal && aspectRatio && aspectRatiosCSS[aspectRatio],
            !isModal && sizes[size],
            isModal ? 'block' : 'bg-cover bg-center object-cover object-center',
        ]"
        alt=""
        data-test="image-element1"
        loading="lazy"
        @error="imageElement1Error = true"
        draggable="false"
    />
    <!-- Show fallback image should the preferred aspect ratio not load. Also used for images shown in the original aspect ratio -->
    <img
        v-else-if="showImageElement2 && srcset2"
        :srcset="!isConnected && cachedImageUrl2 ? undefined : srcset2"
        :src="!isConnected && cachedImageUrl2 ? cachedImageUrl2 : undefined"
        :class="[
            !isModal && aspectRatio && aspectRatiosCSS[aspectRatio],
            !isModal && sizes[size],
            isModal ? 'block' : 'bg-cover bg-center object-cover object-center',
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
            !isModal && aspectRatio && aspectRatiosCSS[aspectRatio],
            !isModal && sizes[size],
            isModal ? 'block' : 'bg-cover bg-center object-cover object-center',
        ]"
        alt=""
        data-test="image-element2"
        loading="lazy"
        @error="imageElement2Error = true"
        draggable="false"
        :key="parentId"
    />
</template>
