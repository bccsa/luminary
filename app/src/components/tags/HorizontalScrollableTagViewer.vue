<script setup lang="ts">
import ContentTile from "@/components/content/ContentTile.vue";
import { ArrowLeftCircleIcon, ArrowRightCircleIcon } from "@heroicons/vue/24/solid";
import { computed, ref, watch } from "vue";
import { useResizeObserver } from "@vueuse/core";
import { DocType, db, type TagDto, type Uuid, type QueryOptions as options } from "luminary-shared";

type Props = {
    tag?: TagDto;
    title?: string;
    queryOptions: options;
    showPublishDate?: boolean;
    currentContentId?: Uuid;
};
const props = withDefaults(defineProps<Props>(), {
    showPublishDate: true,
});

const taggedDocs = db.contentWhereTagAsRef(props.tag?._id, props.queryOptions);

const currentContent = computed(() => {
    return taggedDocs.value.filter((doc) => doc._id !== props.currentContentId);
});

const tagContent = props.tag
    ? db.whereParentAsRef(props.tag._id, DocType.Tag, props.queryOptions.languageId, [])
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
    <div :class="['select-none', { 'mb-5  bg-yellow-500/5 pb-1 pt-3': tag?.pinned }]">
        <h2 class="truncate px-6">
            {{ tagTitle }}
            <span class="ml-1 text-sm text-zinc-500 dark:text-slate-200">
                {{ tagSummary }}
            </span>
        </h2>

        <div class="relative">
            <div
                class="group absolute left-0 top-0 z-10 h-full cursor-pointer px-6"
                @click="spinLeft()"
            >
                <ArrowLeftCircleIcon
                    v-if="showLeftSpin"
                    class="mt-7 h-10 w-10 text-zinc-100 opacity-80 group-hover:opacity-90 md:mt-10 md:h-14 md:w-14"
                    @click="spinLeft()"
                />
            </div>
            <div
                class="group absolute right-0 top-0 z-10 h-full cursor-pointer px-6"
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
                        v-for="content in currentContent"
                        :key="content._id"
                        :content="content"
                        :show-publish-date="showPublishDate"
                    />
                </div>
            </div>
        </div>
    </div>
</template>
