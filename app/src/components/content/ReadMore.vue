<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { DateTime } from "luxon";
import { type ContentDto } from "luminary-shared";
import LImage from "../images/LImage.vue";

const props = defineProps<{ items: ContentDto[] }>();

const summaryText = (content: ContentDto): string => content.summary?.trim() ?? "";

const dateText = (content: ContentDto): string =>
    content.publishDate
        ? DateTime.fromMillis(content.publishDate).toLocaleString(DateTime.DATE_MED)
        : "";

// Infinite list on every breakpoint: start with one batch and reveal the next whenever
// the sentinel below the list scrolls into view (the grid grows vertically too, so the
// same mechanism serves mobile and desktop).
const BATCH_SIZE = 8;
const visibleCount = ref(BATCH_SIZE);
const visibleItems = computed(() => props.items.slice(0, visibleCount.value));

const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | undefined;

onMounted(() => {
    observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting) && visibleCount.value < props.items.length) {
            visibleCount.value += BATCH_SIZE;
        }
    });
    if (sentinel.value) observer.observe(sentinel.value);
});
onUnmounted(() => observer?.disconnect());
watch(
    () => props.items,
    () => {
        visibleCount.value = BATCH_SIZE;
    },
);
</script>

<template>
    <div>
        <!-- Mobile: a single-column list of image-left rows. From tablet up: a grid of
             image-top cards with the title bottom-aligned on the image. Fewer columns than
             the Explore rows so the images stay large. -->
        <ul
            class="flex flex-col px-4 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-6 sm:px-8 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
            <li
                v-for="item in visibleItems"
                :key="item._id"
                class="border-b border-zinc-100 last:border-b-0 dark:border-slate-700 sm:border-0"
            >
                <RouterLink
                    :to="{ name: 'content', params: { slug: item.slug } }"
                    class="ease-out-expo group flex gap-3 py-3 transition hover:brightness-[1.15] sm:h-full sm:flex-col sm:gap-2 sm:overflow-hidden sm:rounded-lg sm:bg-white sm:py-0 sm:shadow sm:ring-1 sm:ring-zinc-950/10 sm:hover:shadow-lg dark:sm:bg-slate-800 dark:sm:ring-white/10"
                >
                    <!-- Mobile: small thumbnail on the left. -->
                    <div class="shrink-0 sm:hidden">
                        <LImage
                            :image="item.parentImageData"
                            :content-parent-id="item.parentId"
                            :parent-image-bucket-id="item.parentImageBucketId"
                            aspectRatio="classic"
                            size="thumbnailCompact"
                        />
                    </div>

                    <!-- Tablet and up: full-width image with the title laid over its bottom
                         edge. The gradient box is anchored to the bottom and grows upward, so
                         a long title wraps over more of the image instead of truncating. Only
                         the visible image loads (both are lazy), so this doesn't fetch two
                         files per card. -->
                    <div class="relative hidden sm:block">
                        <!-- Square corners: the image sits flush against the card's edges and
                             the card's own rounded-lg + overflow-hidden clips the top corners. -->
                        <LImage
                            :image="item.parentImageData"
                            :content-parent-id="item.parentId"
                            :parent-image-bucket-id="item.parentImageBucketId"
                            aspectRatio="classic"
                            size="card"
                            :rounded="false"
                        />
                        <div
                            class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-black/0 px-3 pb-1.5 pt-6"
                        >
                            <h3 class="font-semibold text-white">
                                {{ item.title }}
                            </h3>
                        </div>
                    </div>

                    <div class="flex min-w-0 flex-1 flex-col gap-1 sm:px-3 sm:pb-3">
                        <!-- Mobile only: title beside the thumbnail (on the card it sits on
                             the image instead). -->
                        <h3
                            class="truncate font-semibold text-zinc-800 dark:text-slate-50 sm:hidden"
                        >
                            {{ item.title }}
                        </h3>

                        <p
                            v-if="summaryText(item)"
                            class="line-clamp-1 text-sm text-zinc-500 dark:text-slate-400 sm:line-clamp-2"
                        >
                            {{ summaryText(item) }}
                        </p>

                        <p
                            v-if="dateText(item)"
                            class="text-xs text-zinc-400 dark:text-slate-500"
                        >
                            {{ dateText(item) }}
                        </p>
                    </div>
                </RouterLink>
            </li>
        </ul>

        <!-- Infinite-scroll sentinel: reveals the next batch when it enters the viewport. -->
        <div
            ref="sentinel"
            class="h-px"
            aria-hidden="true"
        ></div>
    </div>
</template>
