<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { type ContentDto } from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import LImage from "../images/LImage.vue";

const props = defineProps<{ items: ContentDto[] }>();

const summaryText = (content: ContentDto): string => content.summary?.trim() ?? "";

const tagIds = computed(() => [...new Set(props.items.flatMap((item) => item.parentTags ?? []))]);
const tagDocs = useContentQuery(
    () => [{ parentId: { $in: tagIds.value.length ? tagIds.value : [] } }],
    { includeScheduled: false },
);
const tagsFor = (content: ContentDto): ContentDto[] => {
    const ids = new Set(content.parentTags ?? []);
    return tagDocs.value.filter((tag) => ids.has(tag.parentId));
};

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
            class="flex flex-col gap-3 px-4 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-6 sm:px-8 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
            <li
                v-for="item in visibleItems"
                :key="item._id"
            >
                <RouterLink
                    :to="{ name: 'content', params: { slug: item.slug } }"
                    class="ease-out-expo group flex gap-2 overflow-hidden rounded-lg bg-white shadow ring-1 ring-zinc-950/10 transition hover:shadow-lg hover:brightness-[1.15] dark:bg-slate-800 dark:ring-white/10 sm:h-full sm:flex-col sm:gap-1"
                >
                    <!-- Mobile: small thumbnail on the left. -->
                    <div class="shrink-0 sm:hidden">
                        <LImage
                            :image="item.parentImageData"
                            :content-parent-id="item.parentId"
                            :parent-image-bucket-id="item.parentImageBucketId"
                            aspectRatio="classic"
                            size="thumbnailCompact"
                            :rounded="false"
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
                            class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-black/0 px-2 pb-1.5 pt-6"
                        >
                            <h3 class="font-semibold text-white">
                                {{ item.title }}
                            </h3>
                        </div>
                    </div>

                    <div
                        class="flex min-w-0 flex-1 flex-col gap-1 py-2 pr-2 sm:justify-center sm:px-2 sm:pb-1 sm:pt-0"
                    >
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

                        <!-- Categories sit at the bottom of the card: mt-auto pushes them below
                             the title and summary when the row is taller than the text. -->
                        <div
                            v-if="tagsFor(item).length"
                            class="mt-auto flex max-w-full gap-1 overflow-x-auto pb-1 scrollbar-hide sm:hidden"
                            data-test="content-tags"
                        >
                            <span
                                v-for="tag in tagsFor(item)"
                                :key="tag._id"
                                class="shrink-0 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400"
                            >
                                {{ tag.title }}
                            </span>
                        </div>
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
