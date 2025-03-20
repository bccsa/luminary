<script setup lang="ts">
// Image component with automatic aspect ratio selection and fallback image

import { computed, onBeforeMount, onMounted, ref, watch } from "vue";
import { type ImageDto, type Uuid } from "luminary-shared";
import mainFallbackImg from "../../assets/fallbackImage.webp";
import { fallbackImages, _fallbackImages } from "@/globalConfig";
import Rand from "rand-seed";

type Props = {
    image?: ImageDto;
    contentParentId?: Uuid;
    aspectRatio?: keyof typeof aspectRatios;
    size?: keyof typeof sizes;
    rounded?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    aspectRatio: "video",
    size: "post",
    rounded: true,
});

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;

const aspectRatios = {
    video: "aspect-video",
    square: "aspect-square",
    vertical: "aspect-[9/16]",
    wide: "aspect-[18/9]",
    classic: "aspect-[4/3]",
};

// Rounded to two decimal places
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

const rounding = {
    small: "rounded-md",
    thumbnail: "rounded-lg",
    post: "md:rounded-lg",
};

let closestAspectRatio = 0;

// Source set for the primary image element with the closest aspect ratio
const srcset1 = computed(() => {
    // Check if there is uploaded image data available and return a blob URL
    if (props.image?.uploadData && props.image.uploadData.length > 0) {
        return URL.createObjectURL(
            new Blob([props.image.uploadData[props.image.uploadData.length - 1].fileData], {
                type: "image/*",
            }),
        );
    }

    if (!props.image?.fileCollections || props.image.fileCollections?.length == 0) return "";

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
                .sort((a, b) => a.width - b.width)
                .map((f) => `${baseUrl}/${f.filename} ${f.width}w`)
                .join(", ");
        })
        .join(", ");
});

// Source set for the secondary image element (used if the primary image element fails to load) with the non-preferred aspect ratios
const srcset2 = computed(() => {
    if (!props.image?.fileCollections || props.image.fileCollections?.length == 0) return "";

    return props.image.fileCollections
        .filter((collection) => collection.aspectRatio != closestAspectRatio)
        .map((collection) => {
            return collection.imageFiles
                .sort((a, b) => a.width - b.width)
                .map((f) => `${baseUrl}/${f.filename} ${f.width}w`)
                .join(", ");
        })
        .join(", ");
});

//As 'n image nog nie 'n  seed het nie, maak 'n nuwe seed
//As daar klaar 'n seed is gebruik daai image met die parentId

onBeforeMount(() => {
    const seed = new Rand(props.contentParentId).next() * fallbackImages.length;

    if (
        _fallbackImages.value.find((src) => src.seed == props.contentParentId) ||
        _fallbackImages.value.includes(seed)
    )
        return;

    const newImageSource = {
        seed: Number(
            String(new Rand(props.contentParentId).next() * fallbackImages.length).replace(".", ""),
        ),
        url: fallbackImages[Math.floor(seed)],
    };

    _fallbackImages.value = [..._fallbackImages.value, newImageSource];
});

const fallbackImage = computed(() => {
    // if (!props.contentParentId) return mainFallbackImg;
    const randomIndex = Math.floor(Math.random() * fallbackImages.length);
    return `../${fallbackImages[randomIndex]}`;
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
            :style="{ 'background-image': 'url(' + fallbackImage + ')' }"
            :class="[
                aspectRatios[aspectRatio],
                rounded ? rounding[size] : '',
                'relative flex w-full flex-col items-center justify-center overflow-clip bg-cover bg-center object-cover shadow',
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
            <div class="absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center">
                <slot name="imageOverlay"></slot>
            </div>
        </div>

        <slot></slot>
    </div>
</template>
