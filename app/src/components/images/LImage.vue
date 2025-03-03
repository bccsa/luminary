<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { type ImageDto } from "luminary-shared";
import fallbackImg from "../../assets/fallbackImage.webp";
import LModal from "../form/LModal.vue";

type Props = {
    image?: ImageDto;
    aspectRatio?: keyof typeof aspectRatios;
    size?: keyof typeof sizes;
    rounded?: boolean;
    zoomable?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    aspectRatio: "video",
    size: "post",
    rounded: true,
    zoomable: false,
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

const imageElement1Error = ref(false);
const imageElement2Error = ref(false);

const showImageElement1 = computed(() => !imageElement1Error.value && srcset1.value != "");
const showImageElement2 = computed(
    () => imageElement1Error.value && !imageElement2Error.value && srcset2.value != "",
);

const showPopup = ref(false);

watch(showPopup, (newVal) => {
    if (newVal) {
        document.body.style.overflow = "hidden";
        document.body.style.userSelect = "none";
        document.body.style.touchAction = "none";
    } else {
        document.body.style.overflow = "";
        document.body.style.userSelect = "";
        document.body.style.touchAction = "";
    }
});

// pinch to zoom
const scale = ref(1);
const initialDistance = ref(0);
const zoomContainer = ref<HTMLElement | null>(null);

const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) {
        const [touch1, touch2] = event.touches;
        initialDistance.value = getDistance(touch1, touch2);
    }
};

const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length === 2) {
        const [touch1, touch2] = event.touches;
        const newDistance = getDistance(touch1, touch2);
        scale.value = Math.max(1, Math.min(3, scale.value * (newDistance / initialDistance.value)));
        initialDistance.value = newDistance;
    }
};

const getDistance = (touch1: Touch, touch2: Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
};
</script>

<template>
    <div :class="sizes[size]">
        <div
            :style="{ 'background-image': 'url(' + fallbackImg + ')' }"
            :class="[
                aspectRatios[aspectRatio],
                rounded ? rounding[size] : '',
                'w-full overflow-clip bg-cover bg-center object-cover shadow',
                zoomable ? 'cursor-zoom-in' : '',
            ]"
            @click="showPopup = true"
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

    <LModal
        v-if="zoomable"
        heading=""
        :isVisible="showPopup"
        @close="showPopup = false"
        :withBackground="false"
        size="xlarge"
        :scrollable="false"
    >
        <div @wheel.prevent ref="zoomContainer" @touchstart="onTouchStart" @touchmove="onTouchMove">
            <img
                src=""
                :srcset="showImageElement1 ? srcset1 || fallbackImg : srcset2 || fallbackImg"
                :class="[
                    aspectRatios[aspectRatio],
                    sizes[size],
                    'rounded-md bg-cover bg-center object-cover object-center',
                    zoomable ? 'cursor-zoom-out' : '',
                ]"
                alt=""
                :data-test="showImageElement1 ? 'image-element1' : 'image-element2'"
                loading="lazy"
                @error="
                    showImageElement1 ? (imageElement1Error = true) : (imageElement2Error = true)
                "
                @click="showPopup = false"
                :style="{ transform: `scale(${scale})` }"
            />
        </div>
    </LModal>
</template>
