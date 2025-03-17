<script setup lang="ts">
import { connectionSpeed } from "@/globalConfig";
import type { ImageDto } from "luminary-shared";
import { computed, ref } from "vue";

type Props = {
    image?: ImageDto;
    aspectRatio?: keyof typeof aspectRatiosCSS;
    size?: keyof typeof sizes;
    rounded?: boolean;
    parentWidth: number;
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
});

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;

let closestAspectRatio = 0;

// Source set for the primary image element with the closest aspect ratio
const srcset1 = computed(() => {
    if (props.image?.uploadData && props.image.uploadData.length > 0) {
        return URL.createObjectURL(
            new Blob([props.image.uploadData[props.image.uploadData.length - 1].fileData], {
                type: "image/*",
            }),
        );
    }

    if (!props.image?.fileCollections || props.image.fileCollections?.length == 0) return "";

    const aspectRatios = props.image.fileCollections
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

    return props.image.fileCollections
        .filter((collection) => collection.aspectRatio == closestAspectRatio)
        .map((collection) => {
            return collection.imageFiles
                .filter((imgFile) =>
                    connectionSpeed > 10
                        ? imgFile.width <= props.parentWidth
                        : imgFile.width <= 180,
                )
                .sort((a, b) => a.width - b.width)
                .map((f) => `${baseUrl}/${f.filename} ${f.width}w`)
                .join(", ");
        });
});

// Source set for the secondary image element (used if the primary image element fails to load)
const srcset2 = computed(() => {
    if (!props.image?.fileCollections || props.image.fileCollections?.length == 0) return "";

    return props.image.fileCollections
        .filter((collection) => collection.aspectRatio != closestAspectRatio)
        .map((collection) => {
            return collection.imageFiles
                .filter((imgFile) => imgFile.width <= props.parentWidth)
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
</script>

<template>
    <!-- @vue-expect-error
     Error:Type 'string | string[]' is not assignable to type 'string | undefined'.
     Type 'string[]' is not assignable to type 'string' 
     This element has a v-if directive and only if srcset 1 exists, which means it will
     never be undefined when ':srcset="srcset1"' is called.
    -->
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
    />
</template>
