<script setup lang="ts">
import ContentTile from "@/components/content/ContentTile.vue";
import { ArrowLeftCircleIcon, ArrowRightCircleIcon } from "@heroicons/vue/24/solid";
import { ref, watch } from "vue";
import { useResizeObserver } from "@vueuse/core";
import { DocType, type TagDto, type queryOptions as options } from "luminary-shared";
import { luminary } from "@/main";

type Props = {
    tag?: TagDto;
    title?: string;
    queryOptions: options;
    showPublishDate?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    showPublishDate: true,
});

const taggedDocs = luminary.db.contentWhereTagAsRef(props.tag?._id, props.queryOptions);
const tagContent = props.tag
    ? luminary.db.whereParentAsRef(props.tag._id, DocType.Tag, props.queryOptions.languageId, [])
    : ref([]);

const tagTitle = ref(props.title);
const tagSummary = ref("");

watch(tagContent, () => {
    if (props.title) {
        tagTitle.value = props.title;
        return;
    }

    if (tagContent.value.length > 0) {
        tagTitle.value = tagContent.value[0].title;
        tagSummary.value = tagContent.value[0].summary || "";
        return;
    }

    tagTitle.value = "No translation found";
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
</script>

<template>
    <div
        :class="['select-none', { 'bg-zinc-100 py-5 dark:bg-zinc-900': tag?.pinned }]"
        class="py-5"
    >
        <h2 class="truncate px-6">
            {{ tagTitle }}
            <span class="ml-1 text-sm text-zinc-500 dark:text-zinc-200">
                {{ tagSummary }}
            </span>
        </h2>

        <div class="relative">
            <div class="group absolute left-0 top-0 h-full cursor-pointer px-6" @click="spinLeft()">
                <ArrowLeftCircleIcon
                    v-if="showLeftSpin"
                    class="mt-7 h-10 w-10 text-zinc-100 opacity-80 group-hover:opacity-90 md:mt-10 md:h-14 md:w-14"
                    @click="spinLeft()"
                />
            </div>
            <div
                class="group absolute right-0 top-0 h-full cursor-pointer px-6"
                @click="spinRight()"
            >
                <ArrowRightCircleIcon
                    v-if="showRightSpin"
                    class="mt-7 h-10 w-10 text-zinc-100 opacity-80 group-hover:opacity-90 md:mt-10 md:h-14 md:w-14"
                />
            </div>

            <div
                ref="scrollElement"
                class="flex overflow-x-scroll py-2 scrollbar-hide"
                @scroll="setSpinBtnVisibility"
            >
                <div ref="scrollContent" class="flex flex-row gap-4 px-6">
                    <ContentTile
                        v-for="content in taggedDocs"
                        :key="content._id"
                        :content="content"
                        :show-publish-date="showPublishDate"
                        class="w-40 overflow-clip md:w-60"
                    />
                </div>
            </div>
        </div>
    </div>
</template>
