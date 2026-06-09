<script setup lang="ts">
import ContentTile from "@/components/content/ContentTile.vue";
import { ArrowLeftCircleIcon, ArrowRightCircleIcon } from "@heroicons/vue/24/solid";
import { computed, ref } from "vue";
import { useInfiniteScroll, useResizeObserver } from "@vueuse/core";
import { type ContentDto } from "luminary-shared";

type AspectRatio =
    | "original"
    | "video"
    | "square"
    | "vertical"
    | "portrait"
    | "wide"
    | "classic"
    | "smallSquare";
type ImageSize = "thumbnail" | "thumbnailFeatured" | "thumbnailCompact";

type Props = {
    contentDocs: ContentDto[];
    title?: string;
    summary?: string;
    showPublishDate?: boolean;
    aspectRatio?: AspectRatio;
    imageSize?: ImageSize;
    contentTitlePosition?: "bottom" | "center" | "overlay";
    tileOverlayLabel?: string;
    showProgress?: boolean;
    verticalTile?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    showPublishDate: true,
});

const computedAspectRatio = computed(() => {
    if (props.verticalTile) return "portrait";
    return props.aspectRatio;
});

const computedImageSize = computed(() => {
    if (props.verticalTile) return "thumbnailCompact";
    return props.imageSize;
});

const computedTitlePosition = computed(() => {
    if (props.verticalTile) return "overlay";
    return props.contentTitlePosition;
});

const spinLeft = () => {
    if (scrollElement.value) scrollElement.value.scrollLeft -= 100;
};
const spinRight = () => {
    if (scrollElement.value) scrollElement.value.scrollLeft += 100;
};

const showLeftSpin = ref(false);
const showRightSpin = ref(false);

const scrollElement = ref<HTMLElement | null>(null);
const scrollContent = ref<HTMLElement | null>(null);

const setSpinBtnVisibility = () => {
    if (scrollElement.value === null) return;

    if (scrollElement.value.scrollWidth <= scrollElement.value.clientWidth) {
        showLeftSpin.value = false;
        showRightSpin.value = false;
        return;
    }

    // Check if the browser is in portrait mode, indicating that a mobile device is being used
    if (window.matchMedia("(orientation: portrait)").matches) {
        showLeftSpin.value = false;
        showRightSpin.value = false;
        return;
    }

    const scrollRight =
        scrollElement.value.scrollWidth -
        scrollElement.value.clientWidth -
        scrollElement.value.scrollLeft;
    const scrollLeft = scrollElement.value.scrollLeft;

    if (scrollLeft > 20) showLeftSpin.value = true;
    if (scrollLeft < 5) showLeftSpin.value = false;
    if (scrollRight > 20) showRightSpin.value = true;
    if (scrollRight < 5) showRightSpin.value = false;
};

useResizeObserver(scrollContent, setSpinBtnVisibility);

// TODO: We might need to set the scroll position to the maximum scroll position when pre-rendering the webpage with SSG (Static Site Generation)
const scrollPosition = ref(10);
const infiniteScrollData = computed(() => props.contentDocs.slice(0, scrollPosition.value));
useInfiniteScroll(
    scrollElement,
    () => {
        scrollPosition.value += 10;
    },
    { distance: 10 },
);
</script>

<template>
    <div class="select-none">
        <h2
            v-if="title"
            class="truncate px-4"
        >
            {{ title }}
            <span
                v-if="summary"
                class="ml-1 text-xs font-normal text-zinc-500 dark:text-slate-200"
            >
                {{ summary }}
            </span>
        </h2>

        <div class="relative">
            <div
                class="group absolute left-0 top-0 z-10 h-full cursor-pointer px-6"
                @click="spinLeft()"
            >
                <ArrowLeftCircleIcon
                    v-if="showLeftSpin"
                    :class="[
                        'mt-7 h-10 w-10 text-zinc-100 opacity-80 group-hover:opacity-90 md:h-14 md:w-14',
                        computedTitlePosition === 'overlay' ? 'md:mt-20' : 'md:mt-10',
                    ]"
                    @click="spinLeft()"
                />
            </div>
            <div
                class="group absolute right-0 top-0 z-10 h-full cursor-pointer px-6"
                @click="spinRight()"
            >
                <ArrowRightCircleIcon
                    v-if="showRightSpin"
                    :class="[
                        'h-10 w-10 text-zinc-100 opacity-80 group-hover:opacity-90 md:mt-10 md:h-14 md:w-14',
                        computedTitlePosition === 'overlay' ? 'md:mt-20' : 'md:mt-10',
                    ]"
                    @click="spinRight()"
                />
            </div>

            <div
                ref="scrollElement"
                class="flex overflow-x-scroll py-2 scrollbar-hide"
                @scroll="setSpinBtnVisibility"
            >
                <div
                    ref="scrollContent"
                    class="flex flex-row gap-4 px-4"
                >
                    <ContentTile
                        v-for="content in infiniteScrollData"
                        :key="content._id"
                        v-memo="[content]"
                        :content="content"
                        :aspectRatio="computedAspectRatio"
                        :imageSize="computedImageSize"
                        :show-publish-date="showPublishDate"
                        :titlePosition="computedTitlePosition"
                        :overlayLabel="tileOverlayLabel"
                        :showProgress="showProgress"
                    />
                </div>
            </div>
        </div>
    </div>
</template>
