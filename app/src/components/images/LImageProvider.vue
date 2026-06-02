<script lang="ts">
export const activeImageCollection = computed(() => (content: ContentDto) => {
    if (!content.parentImageData?.fileCollections?.length) return 0;

    const fileCollections = content.parentImageData.fileCollections;
    const aspectRatio = 1.78; // 'video' aspect ratio as defined in LImage (default)

    // Find the collection with the closest aspect ratio to 'video' (1.78)
    const aspectRatios = fileCollections.map((collection) => collection.aspectRatio);
    const closestAspectRatio = aspectRatios.reduce((acc, cur) => {
        return Math.abs(cur - aspectRatio) < Math.abs(acc - aspectRatio) ? cur : acc;
    }, aspectRatios[0] || 0);

    // Return the index of the collection with the closest aspect ratio
    const index = fileCollections.findIndex(
        (collection) => collection.aspectRatio === closestAspectRatio,
    );

    return index >= 0 ? index : 0; // Return 0 if no suitable collection is found
});
</script>

<script setup lang="ts">
import { fallbackImageUrls } from "@/globalConfig";
import { type ContentDto, type ImageDto, type ImageFileDto, type Uuid } from "luminary-shared";
import Rand from "rand-seed";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useCachedImage } from "@/composables/useCachedImage";

type Props = {
    image?: ImageDto;
    aspectRatio?: keyof typeof aspectRatiosCSS;
    size?: keyof typeof sizes;
    rounded?: boolean;
    parentWidth: number;
    parentId: Uuid;
    isModal?: boolean;
    isIcon?: boolean;
    bucketPublicUrl?: string;
    /**
     * Descriptive alt text for the image. Leave empty for purely decorative images
     * so screen readers will skip them (WCAG-compliant).
     */
    alt?: string;
};

const aspectRatiosCSS = {
    original: "aspect-auto",
    video: "aspect-video",
    square: "aspect-square",
    vertical: "aspect-[9/16]",
    wide: "aspect-[18/9]",
    classic: "aspect-[4/3]",
    smallSquare: "aspect-[3/2]",
};

const aspectRatioNumbers = {
    original: 0, // placeholder for type safety, not used in calculations
    video: 1.78,
    square: 1,
    vertical: 0.56,
    wide: 2,
    classic: 1.33,
    smallSquare: 0.5,
};

const sizes = {
    small: "w-20 max-w-20 min-w-20 md:w-24 md:max-w-24 md:min-w-24",
    thumbnail: "w-36 max-w-36 min-w-36 md:w-52 md:max-w-52 md:min-w-52",
    post: "w-full max-w-full",
    smallSquare: "w-12 max-w-12 min-w-12 md:w-12 md:max-w-12 md:min-w-12",
    icon: "",
};

const props = withDefaults(defineProps<Props>(), {
    aspectRatio: "video",
    size: "post",
    rounded: true,
    isModal: false,
    isIcon: false,
    alt: "Content image",
});

const resolvedAlt = computed(() => {
    if (props.alt !== "Content image") return props.alt;
    if (props.isIcon) return "Icon Image";
    if (props.isModal) return "Enlarged image preview";
    return props.alt;
});

const baseUrl = computed(() => props.bucketPublicUrl);

const devicePixelRatio = window.devicePixelRatio || 1;

// Target render width in device pixels. Deterministic and independent of connection state, so
// the single image URL cached while online is exactly the one requested while offline.
const targetWidth = computed(
    () => (props.parentWidth > 0 ? props.parentWidth : 400) * devicePixelRatio,
);

// Pick the best-fit file: the smallest whose width >= target, otherwise the largest available.
const pickBestFit = (files: ImageFileDto[], target: number): ImageFileDto | undefined => {
    if (!files.length) return undefined;
    const sorted = [...files].sort((a, b) => a.width - b.width);
    return sorted.find((f) => f.width >= target) ?? sorted[sorted.length - 1];
};

// Object URL for a local, unsaved upload blob (e.g. CMS preview). Bypasses network/cache.
const uploadBlobUrl = ref<string | undefined>(undefined);
watch(
    () => props.image?.uploadData,
    (uploadData) => {
        if (uploadBlobUrl.value) {
            URL.revokeObjectURL(uploadBlobUrl.value);
            uploadBlobUrl.value = undefined;
        }
        if (uploadData?.length) {
            uploadBlobUrl.value = URL.createObjectURL(
                new Blob([uploadData[uploadData.length - 1].fileData], { type: "image/*" }),
            );
        }
    },
    { immediate: true },
);
onBeforeUnmount(() => {
    if (uploadBlobUrl.value) URL.revokeObjectURL(uploadBlobUrl.value);
});

// Closest available aspect ratio to the requested one.
const closestAspectRatio = computed(() => {
    const collections = props.image?.fileCollections ?? [];
    if (!collections.length) return 0;

    // In modal mode, don't filter by aspect ratio - use the first available.
    if (props.isModal) return collections[0].aspectRatio;

    const aspectRatios = [...new Set(collections.map((c) => c.aspectRatio))].sort((a, b) => a - b);
    const desired = aspectRatioNumbers[props.aspectRatio];
    return aspectRatios.reduce(
        (acc, cur) => (Math.abs(cur - desired) < Math.abs(acc - desired) ? cur : acc),
        aspectRatios[0],
    );
});

// --- Single CDN URL per rendering role (undefined when a local upload blob is used) ---

// Primary image: best-fit file from the closest-aspect-ratio collection.
const primaryNetworkUrl = computed(() => {
    if (props.aspectRatio == "original" || uploadBlobUrl.value) return undefined;
    if (!props.image?.fileCollections?.length || !baseUrl.value) return undefined;

    const files = props.image.fileCollections
        .filter((c) => c.aspectRatio == closestAspectRatio.value)
        .flatMap((c) => c.imageFiles);
    const best = pickBestFit(files, targetWidth.value);
    return best ? `${baseUrl.value}/${best.filename}` : undefined;
});

// Secondary (fallback) image: best-fit from the other aspect ratios; all collections in
// "original" mode (where there is no primary).
const secondaryNetworkUrl = computed(() => {
    if (uploadBlobUrl.value) return undefined;
    if (!props.image?.fileCollections?.length || !baseUrl.value) return undefined;

    const collections =
        props.aspectRatio == "original"
            ? props.image.fileCollections
            : props.image.fileCollections.filter((c) => c.aspectRatio != closestAspectRatio.value);
    const best = pickBestFit(
        collections.flatMap((c) => c.imageFiles),
        targetWidth.value,
    );
    return best ? `${baseUrl.value}/${best.filename}` : undefined;
});

// Icon mode: smallest available file.
const iconNetworkUrl = computed(() => {
    if (!props.isIcon || uploadBlobUrl.value) return undefined;
    if (!props.image?.fileCollections?.length || !baseUrl.value) return undefined;

    const files = props.image.fileCollections.flatMap((c) => c.imageFiles);
    if (!files.length) return undefined;
    const smallest = files.reduce((a, b) => (a.width < b.width ? a : b));
    return `${baseUrl.value}/${smallest.filename}`;
});

// Modal mode: largest-area file to preserve detail when zooming.
const modalNetworkUrl = computed(() => {
    if (!props.isModal || uploadBlobUrl.value || !baseUrl.value) return undefined;

    const files = props.image?.fileCollections?.flatMap((c) => c.imageFiles) ?? [];
    if (!files.length) return undefined;
    const largest = files.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
    return `${baseUrl.value}/${largest.filename}`;
});

// Resolve each CDN URL to a Cache-API-backed object URL so it is available offline.
const { objectUrl: primaryCached, error: primaryCacheError } = useCachedImage(primaryNetworkUrl);
const { objectUrl: secondaryCached, error: secondaryCacheError } =
    useCachedImage(secondaryNetworkUrl);
const { objectUrl: iconCached, error: iconCacheError } = useCachedImage(iconNetworkUrl);
const { objectUrl: modalCached, error: modalCacheError } = useCachedImage(modalNetworkUrl);

// Final src per role: prefer the local upload blob, otherwise the cached object URL.
const iconSrc = computed(() => uploadBlobUrl.value ?? iconCached.value);
const primarySrc = computed(() => uploadBlobUrl.value ?? primaryCached.value);
const secondarySrc = computed(() => uploadBlobUrl.value ?? secondaryCached.value);
const modalSrc = computed(() => uploadBlobUrl.value ?? modalCached.value);

const imageElement1Error = ref(false);
const imageElement2Error = ref(false);
const modalImageError = ref(false);

// Visibility is driven by whether a candidate URL exists (synchronous) rather than by the
// resolved object URL, so we don't flash the bundled fallback while the cached image is still
// being fetched. A role "fails" on an <img> error or a cache/network failure.
const hasPrimary = computed(() => !!(uploadBlobUrl.value || primaryNetworkUrl.value));
const hasSecondary = computed(() => !!(uploadBlobUrl.value || secondaryNetworkUrl.value));
const hasIcon = computed(() => !!(uploadBlobUrl.value || iconNetworkUrl.value));
const hasModal = computed(() => !!(uploadBlobUrl.value || modalNetworkUrl.value));

const primaryFailed = computed(() => imageElement1Error.value || primaryCacheError.value);
const secondaryFailed = computed(() => imageElement2Error.value || secondaryCacheError.value);

const showImageElement1 = computed(
    () => props.aspectRatio != "original" && hasPrimary.value && !primaryFailed.value,
);
const showImageElement2 = computed(
    () =>
        (props.aspectRatio == "original" || primaryFailed.value) &&
        hasSecondary.value &&
        !secondaryFailed.value,
);

const pickFallbackImage = () =>
    fallbackImageUrls[
        Math.floor(new Rand(props.parentId).next() * fallbackImageUrls.length)
    ] as string;

const fallbackImageUrl = ref<string | undefined>(pickFallbackImage());
</script>

<template>
    <!-- Modal mode: single <img> honoring natural dimensions (no forced aspect ratio) -->
    <img
        v-if="isModal && hasModal && !modalImageError && !modalCacheError"
        :src="modalSrc"
        :alt="resolvedAlt"
        class="h-auto max-h-[90vh] w-auto max-w-[90vw] select-none object-contain"
        draggable="false"
        data-test="image-element1"
        @error="modalImageError = true"
    />
    <img
        v-else-if="isModal && fallbackImageUrl"
        :src="fallbackImageUrl"
        :alt="resolvedAlt"
        class="h-auto max-h-[90vh] w-auto max-w-[90vw] select-none object-contain"
        draggable="false"
        data-test="image-element1"
    />
    <!-- Icon mode: simple contained rendering, no fallback landscape -->
    <img
        v-else-if="isIcon && hasIcon && !iconCacheError"
        :src="iconSrc"
        class="h-full w-full object-contain"
        :alt="resolvedAlt"
        data-test="image-element1"
        loading="lazy"
        draggable="false"
    />
    <!-- Icon mode: no image available, render nothing -->
    <span v-else-if="isIcon" />
    <!-- Non-modal primary image (closest aspect ratio, responsive best-fit) -->
    <img
        v-else-if="showImageElement1"
        :src="primarySrc"
        :class="[
            !isModal && aspectRatio && aspectRatiosCSS[aspectRatio],
            !isModal && sizes[size],
            isModal ? 'block' : 'bg-cover bg-center object-cover object-center',
        ]"
        :alt="resolvedAlt"
        data-test="image-element1"
        loading="lazy"
        @error="imageElement1Error = true"
        draggable="false"
    />
    <!-- Show fallback image should the preferred aspect ratio not load. Also used for images shown in the original aspect ratio -->
    <img
        v-else-if="showImageElement2"
        :src="secondarySrc"
        :class="[
            !isModal && aspectRatio && aspectRatiosCSS[aspectRatio],
            !isModal && sizes[size],
            isModal ? 'block' : 'bg-cover bg-center object-cover object-center',
        ]"
        :alt="resolvedAlt"
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
        :alt="resolvedAlt"
        data-test="image-element2"
        loading="lazy"
        @error="imageElement2Error = true"
        draggable="false"
        :key="parentId"
    />
</template>
