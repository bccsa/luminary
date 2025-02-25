<script setup lang="ts">
import { computed, ref } from "vue";
import { type ImageDto } from "luminary-shared";
import fallbackImg from "../../assets/fallbackImage.webp";

type Props = {
    image?: ImageDto;
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

// Find closest aspect ratio
let closestAspectRatio = 0;
const srcset1 = computed(() => {
    if (!props.image?.fileCollections?.length) return "";

    const desiredAspectRatio = aspectRatioNumbers[props.aspectRatio];
    const aspectRatios = [...new Set(props.image.fileCollections.map((c) => c.aspectRatio))].sort(
        (a, b) => a - b,
    );

    const closestAspectRatio = aspectRatios.reduce((acc, cur) =>
        Math.abs(cur - desiredAspectRatio) < Math.abs(acc - desiredAspectRatio) ? cur : acc,
    );

    return props.image.fileCollections
        .filter((c) => c.aspectRatio === closestAspectRatio)
        .flatMap((c) => c.imageFiles)
        .sort((a, b) => a.width - b.width)
        .map((f) => `${baseUrl}/${f.filename} ${f.width}w`)
        .join(", ");
});

const srcset2 = computed(() => {
    if (!props.image?.fileCollections?.length) return "";

    return props.image.fileCollections
        .filter((c) => c.aspectRatio !== closestAspectRatio)
        .flatMap((c) => c.imageFiles)
        .sort((a, b) => a.width - b.width)
        .map((f) => `${baseUrl}/${f.filename} ${f.width}w`)
        .join(", ");
});

const imageError = ref(false);
</script>

<template>
    <div :class="sizes[size]">
        <div
            :style="{ backgroundImage: `url(${fallbackImg})` }"
            :class="[
                aspectRatios[aspectRatio],
                rounded ? rounding[size] : '',
                'w-full overflow-hidden bg-cover bg-center object-cover shadow',
            ]"
        >
            <picture>
                <source v-if="srcset1" :srcset="srcset1" @error="imageError = true" />
                <source v-if="srcset2" :srcset="srcset2" @error="imageError = true" />
                <img
                    :src="fallbackImg"
                    :class="[
                        aspectRatios[aspectRatio],
                        sizes[size],
                        'bg-cover bg-center object-cover object-center',
                    ]"
                    alt="Image"
                    loading="lazy"
                    @error="imageError = true"
                />
            </picture>
        </div>

        <slot></slot>
    </div>
</template>
