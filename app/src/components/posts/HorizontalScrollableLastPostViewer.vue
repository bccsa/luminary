<script setup lang="ts">
import PostTile from "@/components/posts/PostTile.vue";
import { usePostStore } from "@/stores/post";
import { storeToRefs } from "pinia";
import { ArrowLeftCircleIcon, ArrowRightCircleIcon } from "@heroicons/vue/24/solid";
import { computed, ref } from "vue";
import { useResizeObserver } from "@vueuse/core";
import type { Post } from "@/types";

const { posts } = storeToRefs(usePostStore());

const getLastPosts = (allPosts: Post[]) => {
    return allPosts
        .sort((a, b) => {
            const aDate = a.content[0]?.publishDate ?? (0 as any);
            const bDate = b.content[0]?.publishDate ?? (0 as any);
            return bDate - aDate;
        })
        .slice(0, 15);
};

const lastPosts = computed(() => {
    return posts.value ? getLastPosts(posts.value) : [];
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
    <div :class="['select-none', { 'bg-zinc-100 py-6 dark:bg-zinc-900': posts }]">
        <h2 class="truncate px-6 text-lg">
            Latest Posts
            <span class="ml-1 text-sm text-zinc-500 dark:text-zinc-200">
                These are the last posts
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
                    <PostTile
                        v-for="post in lastPosts"
                        :key="post._id"
                        :post="post"
                        class="w-40 overflow-clip md:w-60"
                    />
                </div>
            </div>
        </div>
    </div>
</template>
