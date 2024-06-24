<script setup lang="ts">
import ContentTile from "@/components/posts/ContentTile.vue";
import { ArrowLeftCircleIcon, ArrowRightCircleIcon } from "@heroicons/vue/24/solid";
import { ref, watch } from "vue";
import { useResizeObserver } from "@vueuse/core";
import {
    DocType,
    TagType,
    db,
    type ContentDto,
    type TagDto,
    type Uuid,
    type queryOptions as options,
} from "luminary-shared";

type Props = {
    tag?: TagDto;
    title?: string;
    queryOptions?: options;
    languageId: Uuid;
};
const props = defineProps<Props>();

const taggedDocs = db.whereTagAsRef(props.tag?._id, props.queryOptions);

const content = ref();
const tagTitle = ref(props.title);
const tagSummary = ref("");

if (props.tag) {
    const tagContent = db.whereParentAsRef<ContentDto[]>(props.tag._id, DocType.Tag, []);
    content.value = tagContent;

    watch(tagContent, () => {
        const preferred = tagContent.value.find((c) => c.language == props.languageId);

        if (preferred) {
            tagTitle.value = preferred.title;
            tagSummary.value = preferred.summary || "";
            return;
        }

        if (tagContent.value.length > 0) {
            tagTitle.value = tagContent.value[0].title;
            tagSummary.value = tagContent.value[0].summary || "";
            return;
        }
        tagTitle.value = "No translation found";
    });
}

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
    <!-- <div class="text-sm text-black" v-for="doc in taggedDocs" :key="doc._id">{{ doc._id }}</div> -->

    <div :class="['select-none', { 'bg-zinc-100 py-6 dark:bg-zinc-900': tag?.pinned }]">
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
                        :parent="content"
                        :tagType="TagType.Category"
                        :pinned="tag?.pinned"
                        class="w-40 overflow-clip md:w-60"
                    />
                </div>
            </div>
        </div>
    </div>
</template>
