<script setup lang="ts">
// Image component with automatic aspect ratio selection and fallback image
import { onMounted, ref, watch } from "vue";
import { type ImageDto, type Uuid } from "luminary-shared";
import LImageProvider from "./LImageProvider.vue";

type Props = {
    image?: ImageDto;
    contentParentId: Uuid;
    aspectRatio?: keyof typeof aspectRatiosCSS;
    size?: keyof typeof sizes;
    rounded?: boolean;
    isModal?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    size: "post",
    rounded: true,
    isModal: false,
});

const aspectRatiosCSS = {
    video: "aspect-video",
    square: "aspect-square",
    vertical: "aspect-[9/16]",
    wide: "aspect-[18/9]",
    classic: "aspect-[4/3]",
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

const parentRef = ref<HTMLElement | undefined>(undefined);
const parentWidth = ref<number>(0);

onMounted(() => {
    parentWidth.value = parentRef.value?.clientWidth || 0;
    watch(
        () => parentRef.value?.clientWidth,
        (newWidth) => {
            parentWidth.value = newWidth || 0;
        },
    );
});
</script>

<template>
    <div ref="parentRef" :class="isModal ? '' : sizes[size]">
        <div
            v-if="!isModal"
            :class="[
                aspectRatio ? aspectRatiosCSS[aspectRatio] : '',
                rounded ? rounding[size] : '',
                'relative w-full overflow-clip bg-cover bg-center object-cover shadow',
            ]"
        >
            <LImageProvider
                :parent-id="contentParentId"
                :parent-width="parentWidth"
                :image="props.image"
                :aspect-ratio="props.aspectRatio"
                :rounded="props.rounded"
                :size="props.size"
                :is-modal="props.isModal"
            />
            <div class="absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center">
                <slot name="imageOverlay"></slot>
            </div>
        </div>

        <!-- Modal mode: no container constraints -->
        <LImageProvider
            v-else
            :parent-id="contentParentId"
            :parent-width="parentWidth"
            :image="props.image"
            :rounded="props.rounded"
            :size="props.size"
            :is-modal="props.isModal"
        />

        <slot></slot>
    </div>
</template>
