<script setup lang="ts">
import { onMounted, onUnmounted, nextTick, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { DateTime } from "luxon";
import { type ContentDto } from "luminary-shared";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/vue/24/solid";
import LImage from "../images/LImage.vue";

export type ReadMoreItem = {
    content: ContentDto;
    tags: string[];
};

const props = defineProps<{ items: ReadMoreItem[] }>();

const summaryText = (content: ContentDto): string => content.summary?.trim() ?? "";

const dateText = (content: ContentDto): string =>
    content.publishDate
        ? DateTime.fromMillis(content.publishDate).toLocaleString(DateTime.DATE_MED)
        : "";

// Keep the chips to a single line: show the first few, then a "+N" chip for the rest.
const MAX_VISIBLE_TAGS = 2;
const visibleTags = (tags: string[]): string[] => tags.slice(0, MAX_VISIBLE_TAGS);
const extraTagCount = (tags: string[]): number => Math.max(0, tags.length - MAX_VISIBLE_TAGS);

// Mobile is an infinite list: start with one batch and reveal the next whenever the
// sentinel below the list scrolls into view. Every card is rendered up front — the
// tablet/desktop scroll row shows them all (images are lazy, so off-screen cards cost
// nothing), while mobile hides the ones past `visibleCount`. The sentinel is mobile-only
// (display:none never intersects), so the observer can't fire on desktop.
const BATCH_SIZE = 8;
const visibleCount = ref(BATCH_SIZE);

const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | undefined;

// From tablet up the cards sit in a horizontal scroll row. The arrows only show on desktop
// (where a mouse can't scroll sideways) and only when there's more to reveal in that direction.
const scrollEl = ref<HTMLElement | null>(null);
const showLeft = ref(false);
const showRight = ref(false);

const updateArrows = () => {
    const el = scrollEl.value;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    showLeft.value = el.scrollLeft > 5;
    showRight.value = maxScroll > 5 && el.scrollLeft < maxScroll - 5;
};

const scrollByCards = (direction: 1 | -1) => {
    scrollEl.value?.scrollBy({ left: direction * 320, behavior: "smooth" });
};

onMounted(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);

    observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting) && visibleCount.value < props.items.length) {
            visibleCount.value += BATCH_SIZE;
        }
    });
    if (sentinel.value) observer.observe(sentinel.value);
});
onUnmounted(() => {
    window.removeEventListener("resize", updateArrows);
    observer?.disconnect();
});
watch(
    () => props.items,
    () => {
        visibleCount.value = BATCH_SIZE;
        nextTick(updateArrows);
    },
);
</script>

<template>
    <div class="relative">
        <!-- Desktop scroll controls (touch devices scroll the row directly). -->
        <button
            v-if="showLeft"
            type="button"
            aria-label="Scroll left"
            class="absolute left-1 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/90 p-1 text-zinc-700 shadow ring-1 ring-black/5 hover:bg-white dark:bg-slate-800/90 dark:text-slate-100 dark:ring-white/10 sm:flex"
            @click="scrollByCards(-1)"
        >
            <ChevronLeftIcon class="h-5 w-5" />
        </button>
        <button
            v-if="showRight"
            type="button"
            aria-label="Scroll right"
            class="absolute right-1 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/90 p-1 text-zinc-700 shadow ring-1 ring-black/5 hover:bg-white dark:bg-slate-800/90 dark:text-slate-100 dark:ring-white/10 sm:flex"
            @click="scrollByCards(1)"
        >
            <ChevronRightIcon class="h-5 w-5" />
        </button>

        <!-- Mobile: a padded single-column list of image-left rows. From tablet up: a full-bleed
             horizontal scroll row of image-on-top cards (the scroll container spans the full
             width; the inner list keeps an edge inset), matching the Explore content rows. -->
        <div
            ref="scrollEl"
            class="sm:overflow-x-auto sm:scrollbar-hide"
            @scroll="updateArrows"
        >
            <ul class="flex flex-col px-4 sm:flex-row sm:gap-4">
                <li
                    v-for="(item, index) in items"
                    :key="item.content._id"
                    class="border-b border-zinc-100 last:border-b-0 dark:border-slate-700 sm:w-48 sm:shrink-0 sm:border-0"
                    :class="{ 'hidden sm:block': index >= visibleCount }"
                >
                    <RouterLink
                        :to="{ name: 'content', params: { slug: item.content.slug } }"
                        class="ease-out-expo group flex gap-3 py-3 transition hover:brightness-[1.15] sm:flex-col sm:gap-2 sm:py-0"
                    >
                        <!-- Mobile: small thumbnail on the left. -->
                        <div class="shrink-0 sm:hidden">
                            <LImage
                                :image="item.content.parentImageData"
                                :content-parent-id="item.content.parentId"
                                :parent-image-bucket-id="item.content.parentImageBucketId"
                                aspectRatio="classic"
                                size="thumbnailCompact"
                            />
                        </div>

                        <!-- Tablet and up: full-width image on top of the card. Only the visible
                             image loads (both are lazy), so this doesn't fetch two files per card. -->
                        <div class="hidden sm:block">
                            <LImage
                                :image="item.content.parentImageData"
                                :content-parent-id="item.content.parentId"
                                :parent-image-bucket-id="item.content.parentImageBucketId"
                                aspectRatio="classic"
                                size="card"
                            />
                        </div>

                        <div class="flex min-w-0 flex-1 flex-col gap-1">
                            <h3 class="truncate font-semibold text-zinc-800 dark:text-slate-50">
                                {{ item.content.title }}
                            </h3>

                            <p
                                v-if="summaryText(item.content)"
                                class="line-clamp-1 text-sm text-zinc-500 dark:text-slate-400 sm:line-clamp-2"
                            >
                                {{ summaryText(item.content) }}
                            </p>

                            <p
                                v-if="dateText(item.content)"
                                class="text-xs text-zinc-400 dark:text-slate-500"
                            >
                                {{ dateText(item.content) }}
                            </p>

                            <!-- One line of category chips (same colour as the category tags under
                                 the bookmark icon, without the tag icon), with a "+N" chip for the
                                 rest. -->
                            <div
                                v-if="item.tags.length"
                                class="mt-0.5 flex gap-1.5 overflow-hidden"
                            >
                                <span
                                    v-for="tag in visibleTags(item.tags)"
                                    :key="tag"
                                    class="shrink-0 whitespace-nowrap rounded-lg border border-yellow-500/25 bg-yellow-500/10 px-2 py-0.5 text-xs text-zinc-700 dark:bg-slate-700 dark:text-slate-100"
                                >
                                    {{ tag }}
                                </span>
                                <span
                                    v-if="extraTagCount(item.tags)"
                                    class="shrink-0 whitespace-nowrap rounded-lg border border-yellow-500/25 bg-yellow-500/10 px-2 py-0.5 text-xs text-zinc-700 dark:bg-slate-700 dark:text-slate-100"
                                >
                                    +{{ extraTagCount(item.tags) }}
                                </span>
                            </div>
                        </div>
                    </RouterLink>
                </li>
            </ul>
        </div>

        <!-- Mobile infinite-scroll sentinel: reveals the next batch when it enters the
             viewport. Hidden from tablet up, where the row is horizontally scrollable. -->
        <div
            ref="sentinel"
            class="h-px sm:hidden"
            aria-hidden="true"
        ></div>
    </div>
</template>
