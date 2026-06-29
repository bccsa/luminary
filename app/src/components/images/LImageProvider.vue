<script lang="ts">
import { computed } from "vue";
import { type ContentDto } from "luminary-shared";

export const aspectRatiosCSS = {
    original: "aspect-auto",
    video: "aspect-video",
    square: "aspect-square",
    vertical: "aspect-[9/16]",
    portrait: "aspect-[3/4]",
    wide: "aspect-[18/9]",
    classic: "aspect-[4/3]",
    smallSquare: "aspect-[3/2]",
};
export type AspectRatio = keyof typeof aspectRatiosCSS;

export const aspectRatioNumbers = {
    original: 0,
    video: 1.78,
    square: 1,
    vertical: 0.56,
    portrait: 0.75,
    wide: 2,
    classic: 1.33,
    smallSquare: 0.5,
};

export const sizes = {
    small: "w-20 max-w-20 min-w-20 md:w-24 md:max-w-24 md:min-w-24",
    thumbnail: "w-36 max-w-36 min-w-36 md:w-52 md:max-w-52 md:min-w-52",
    thumbnailFeatured: "w-[165px] max-w-[165px] min-w-[165px] md:w-56 md:max-w-56 md:min-w-56",
    thumbnailCompact: "w-32 max-w-32 min-w-32 md:w-44 md:max-w-44 md:min-w-44",
    post: "w-full max-w-full",
    smallSquare: "w-12 max-w-12 min-w-12 md:w-12 md:max-w-12 md:min-w-12",
    icon: "",
};
export type ImageSize = keyof typeof sizes;

// HTML `sizes` attribute (CSS px) per slot, mirroring the rendered widths in `sizes` above. This is
// what lets the browser pick the right srcset variant for the slot AND the device pixel ratio — the
// browser applies DPR itself, so these values are intentionally NOT multiplied by devicePixelRatio.
// `md` = 768px, `lg` = 1024px (Tailwind defaults). The hero (`post`) is full-width on mobile and
// capped by the article's `lg:max-w-3xl` (768px) wrapper on desktop, with a little headroom.
export const sizesMap: Record<ImageSize, string> = {
    small: "(min-width: 768px) 96px, 80px",
    thumbnail: "(min-width: 768px) 208px, 144px",
    thumbnailFeatured: "(min-width: 768px) 224px, 165px",
    thumbnailCompact: "(min-width: 768px) 176px, 128px",
    post: "(min-width: 1024px) 800px, 100vw",
    smallSquare: "48px",
    icon: "",
};

// Reduced-data `sizes` per slot: the target advertised width in reduced-data mode. At render this is
// divided by the device pixel ratio (capped at `REDUCED_DPR_CAP`, see `sizesAttr`) so a retina phone
// fetches a ~1x image instead of a 2–3x one — the actual byte savings on mobile. Values mirror the
// rendered mobile width per slot (the hero pre-halves to 50vw). Used via reduced-data mode and the
// `prefers-reduced-data` media query.
export const sizesReducedMap: Record<ImageSize, string> = {
    small: "80px",
    thumbnail: "144px",
    thumbnailFeatured: "165px",
    thumbnailCompact: "128px",
    post: "50vw",
    smallSquare: "48px",
    icon: "",
};

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
import { fallbackImageUrls, isDataSaverEnabled, userDataSaverEnabled } from "@/globalConfig";
import { isSlowConnection } from "@/composables/useNetworkSpeedEstimator";
import { type ImageDto, type ImageFileDto, type Uuid } from "luminary-shared";
import Rand from "rand-seed";
import { thumbHashToDataURL } from "thumbhash";
import { ref } from "vue";

type Props = {
    image?: ImageDto;
    aspectRatio?: AspectRatio;
    size?: ImageSize;
    rounded?: boolean;
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

// "Reduced data" mode lowers image weight on three signals, any one of which is enough: a measured
// slow connection, the user's Settings toggle, and the OS/browser Data Saver flag. (A fourth,
// declarative `prefers-reduced-data` path is handled in `sizesAttr`.) Reactive, so the srcset/sizes
// recompute live when a probe changes the speed or the user flips the toggle.
const reducedData = computed(
    () => isSlowConnection.value || userDataSaverEnabled.value || isDataSaverEnabled(),
);

// All collections for this image, unfiltered. We deliberately hand the browser the FULL srcset ladder
// (never pre-filtering variants by width) plus a correct `sizes` attribute, so it can pick the variant
// that fits the slot AND the device pixel ratio. Reduced-data mode lowers quality by shrinking `sizes`
// (see `sizesAttr`), NOT by dropping rungs here — selecting in JS was DPR-blind and dropped the
// high-res variants before the browser ever saw them.
const allFileCollections = computed(() => props.image?.fileCollections ?? []);

// Calculate the closest aspect ratio to the desired one
const closestAspectRatio = computed(() => {
    if (!allFileCollections.value.length) return 0;

    // In modal mode, don't filter by aspect ratio - use the first available
    if (props.isModal && allFileCollections.value.length > 0) {
        return allFileCollections.value[0].aspectRatio;
    }

    const aspectRatios = allFileCollections.value
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

// The collection the display image (element1) renders — the closest-aspect one. Used to source the
// ThumbHash blur for that same photo.
const displayCollection = computed(() =>
    allFileCollections.value.find((c) => c.aspectRatio === closestAspectRatio.value),
);

// `object-cover` scales the source up until it fills the slot's aspect-ratio box, cropping the
// overflow. When the displayed collection is WIDER than the box (e.g. a landscape image in a
// portrait/vertical tile), the browser still picks a srcset variant from the slot WIDTH alone and
// under-fetches, so the cover-cropped image is upscaled and looks soft. Inflate the advertised
// `sizes` width by how much the cover-crop over-scales — `sourceAspect / containerAspect` — so the
// browser fetches a high-enough variant. Ratio ≤ 1 (source same/narrower than the box) → no change.
const coverScaleFactor = computed(() => {
    const containerAspect = aspectRatioNumbers[props.aspectRatio];
    const sourceAspect = closestAspectRatio.value;
    if (!containerAspect || !sourceAspect) return 1; // `original` aspect / no collections
    return Math.max(1, sourceAspect / containerAspect);
});

// Multiply only the length values (not media-query breakpoints) in a `sizes` string by `factor`.
// Each comma-separated segment is `[<media-condition>] <length>`; only the trailing length scales,
// so `(min-width: 768px)` breakpoints are left untouched. Non-px lengths (e.g. `vw`) pass through.
const inflateSizes = (sizesStr: string, factor: number): string => {
    if (factor <= 1) return sizesStr;
    return sizesStr
        .split(",")
        .map((part) =>
            part.replace(
                /(\d+(?:\.\d+)?)px(\s*)$/,
                (_full, n, ws) => `${Math.round(Number(n) * factor)}px${ws}`,
            ),
        )
        .join(",");
};

// In reduced-data mode we cap the *effective* device pixel ratio at this. `sizes` is otherwise
// DPR-blind (the browser multiplies by DPR itself), so a "reduced" slot equal to the rendered width
// still fetches a 2–3x variant on a retina phone. Dividing the slot width by DPR (down to this cap)
// makes the browser fetch a ~1x image instead. 1 = max savings / softest; bump to 1.5 for a balance.
const REDUCED_DPR_CAP = 1;

// Multiply one CSS length token (px/vw) by `factor`, rounded. Used to divide the reduced slot width
// down by the device pixel ratio so the browser fetches a lower-density variant. factor >= 1 is a
// no-op (e.g. a 1x display, where there's nothing to undercut).
const scaleLength = (length: string, factor: number): string =>
    factor >= 1
        ? length
        : length.replace(
              /(\d+(?:\.\d+)?)(px|vw)/,
              (_full, n, unit) => `${Math.round(Number(n) * factor)}${unit}`,
          );

// The HTML `sizes` attribute for the current slot (undefined for icon mode, which uses a direct src),
// inflated for cover-crop over-scaling (see `coverScaleFactor`). Drops to the smaller, DPR-capped slot
// when:
//   1. `reducedData` (slow connection, the user's toggle, or the OS/browser `saveData` flag): force
//      the smaller slot — also covers Chromium browsers that expose the flag but not the media query.
//   2. `(prefers-reduced-data: reduce)`: advertise the smaller slot declaratively so supporting
//      browsers downshift live; everyone else falls through to the full slot.
const sizesAttr = computed(() => {
    const base = sizesMap[props.size];
    if (!base) return undefined; // icon mode
    const baseInflated = inflateSizes(base, coverScaleFactor.value);
    const reduced = sizesReducedMap[props.size];
    if (!reduced) return baseInflated;
    // Divide the reduced slot width by DPR (down to REDUCED_DPR_CAP) so the browser fetches a lower-
    // density image. DPR is known at render time, so this is also correct for the declarative branch.
    // Reduced mode is deliberately NOT cover-crop-inflated — lower quality is the accepted trade.
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const reducedCapped = scaleLength(reduced, Math.min(1, REDUCED_DPR_CAP / dpr));
    if (reducedData.value) return reducedCapped;
    return `(prefers-reduced-data: reduce) ${reducedCapped}, ${baseInflated}`;
});

// Decode the collection's base64 ThumbHash into a blurred data URL, shown as the <img> background so
// a preview of the *correct* photo appears instantly (and offline) until the real image paints over.
const decodeThumbHash = (base64?: string): string | undefined => {
    if (!base64) return undefined;
    try {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        return thumbHashToDataURL(bytes);
    } catch {
        return undefined;
    }
};
const thumbHashDataUrl = computed(() => decodeThumbHash(displayCollection.value?.thumbHash));
const thumbHashStyle = computed(() =>
    thumbHashDataUrl.value ? { backgroundImage: `url("${thumbHashDataUrl.value}")` } : undefined,
);

// Direct src for icon mode: pick the smallest available image file (no srcset needed)
const iconSrc = computed(() => {
    if (!props.isIcon) return undefined;

    // Prefer local upload blob if available (unsaved image)
    if (props.image?.uploadData?.length) {
        return URL.createObjectURL(
            new Blob([props.image.uploadData[props.image.uploadData.length - 1].fileData], {
                type: "image/*",
            }),
        );
    }

    if (!props.image?.fileCollections?.length || !baseUrl.value) return undefined;

    // Find the smallest image file across all collections
    const allFiles = props.image.fileCollections.flatMap((fc) => fc.imageFiles);
    if (!allFiles.length) return undefined;

    const smallest = allFiles.reduce((a, b) => (a.width < b.width ? a : b));
    return `${baseUrl.value}/${smallest.filename}`;
});

// Source set for the primary image element with the closest aspect ratio
const srcset1 = computed(() => {
    if (props.aspectRatio == "original") return "";

    if (props.image?.uploadData && props.image.uploadData.length > 0) {
        return URL.createObjectURL(
            new Blob([props.image.uploadData[props.image.uploadData.length - 1].fileData], {
                type: "image/*",
            }),
        );
    }

    if (!allFileCollections.value.length || !baseUrl.value) return "";

    // In icon/modal mode, use all available images without aspect ratio filtering
    const collectionsToUse =
        props.isIcon || props.isModal
            ? allFileCollections.value
            : allFileCollections.value.filter(
                  (collection) => collection.aspectRatio == closestAspectRatio.value,
              );

    return collectionsToUse
        .map((collection) => {
            return [...collection.imageFiles]
                .sort((a, b) => a.width - b.width)
                .map((f) => `${baseUrl.value}/${f.filename} ${f.width}w`)
                .join(", ");
        })
        .join(", ");
});

// Source set for the secondary image element (used if the primary image element fails to load, or
// for `original` aspect ratio). Lists the full ladder of the OTHER aspect-ratio collections; the
// browser picks the right variant via the `sizes` attribute.
const srcset2 = computed(() => {
    if (!allFileCollections.value.length || !baseUrl.value) return "";

    return allFileCollections.value
        .filter((collection) => collection.aspectRatio !== closestAspectRatio.value)
        .map((collection) => {
            return [...collection.imageFiles]
                .sort((a, b) => a.width - b.width)
                .map((f) => `${baseUrl.value}/${f.filename} ${f.width}w`)
                .join(", ");
        })
        .join(", ");
});

const imageElement1Error = ref(false);
const imageElement2Error = ref(false);
const modalImageError = ref(false);

const showImageElement1 = computed(
    () => props.aspectRatio != "original" && !imageElement1Error.value && srcset1.value != "",
);
const showImageElement2 = computed(
    () =>
        (props.aspectRatio == "original" || imageElement1Error.value) &&
        !imageElement2Error.value &&
        srcset2.value != "",
);

const pickFallbackImage = () =>
    fallbackImageUrls[
        Math.floor(new Rand(props.parentId).next() * fallbackImageUrls.length)
    ] as string;

const fallbackImageUrl = ref<string | undefined>(pickFallbackImage());

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
    if (!props.isModal || !baseUrl.value) return undefined;
    const allFiles = (props.image?.fileCollections?.flatMap((fc) => fc.imageFiles) ||
        []) as ImageFileDto[];
    if (!allFiles.length) return fallbackImageUrl.value;
    // Pick the file with the largest area (width * height) to preserve detail for zooming
    const largest = allFiles.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
    return `${baseUrl.value}/${largest.filename}`;
});

// Build a full srcset for modal mode so tests (and the browser) can still pick optimal sizes
const modalSrcset = computed(() => {
    if (!props.isModal || !baseUrl.value) return "";
    // If using uploadData blob, we cannot build a srcset of different widths
    if (props.image?.uploadData?.length) return "";
    const files = (props.image?.fileCollections?.flatMap((fc) => fc.imageFiles) || [])
        .slice()
        .sort((a, b) => a.width - b.width);
    if (!files.length) return "";
    return files.map((f) => `${baseUrl.value}/${f.filename} ${f.width}w`).join(", ");
});
</script>

<template>
    <!-- Modal mode: single <img> honoring natural dimensions (no forced aspect ratio) -->
    <img
        v-if="isModal && modalSrc && !modalImageError"
        :src="modalSrc"
        :srcset="modalSrcset || undefined"
        sizes="90vw"
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
        v-else-if="isIcon && iconSrc"
        :src="iconSrc"
        class="h-full w-full object-contain"
        :alt="resolvedAlt"
        data-test="image-element1"
        loading="lazy"
        draggable="false"
    />
    <!-- Icon mode: no image available, render nothing -->
    <span v-else-if="isIcon" />
    <!-- Non-modal mode (original logic with responsive srcset & aspect ratio handling) -->
    <img
        v-else-if="srcset1 && showImageElement1"
        :srcset="srcset1"
        :sizes="sizesAttr"
        :style="thumbHashStyle"
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
        v-else-if="showImageElement2 && srcset2"
        :srcset="srcset2"
        :sizes="sizesAttr"
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
