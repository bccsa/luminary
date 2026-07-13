<script setup lang="ts">
import { RouterLink } from "vue-router";
import { DateTime } from "luxon";
import { type ContentDto } from "luminary-shared";
import LImage from "../images/LImage.vue";

export type ReadMoreItem = {
    content: ContentDto;
    tags: string[];
};

defineProps<{ items: ReadMoreItem[] }>();

const summaryText = (content: ContentDto): string => content.summary?.trim() ?? "";

const dateText = (content: ContentDto): string =>
    content.publishDate
        ? DateTime.fromMillis(content.publishDate).toLocaleString(DateTime.DATE_MED)
        : "";
</script>

<template>
    <!-- Mobile is a single-column list of image-left rows. From tablet up it becomes a grid of
         image-on-top cards (the layout most content sites use for "related" — vertical cards
         tile better than wide rows): two columns on tablet, three on desktop. -->
    <ul class="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-3">
        <li
            v-for="item in items"
            :key="item.content._id"
            class="border-b border-zinc-100 last:border-b-0 dark:border-slate-700 sm:border-0"
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

                <!-- Tablet and up: full-width image on top of the card. Only the visible image
                     loads (both are lazy), so this doesn't fetch two files per card. -->
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
                    <h3 class="line-clamp-2 font-semibold text-zinc-800 dark:text-slate-50">
                        {{ item.content.title }}
                    </h3>

                    <p
                        v-if="summaryText(item.content)"
                        class="line-clamp-2 text-sm text-zinc-500 dark:text-slate-400"
                    >
                        {{ summaryText(item.content) }}
                    </p>

                    <p
                        v-if="dateText(item.content)"
                        class="text-xs text-zinc-400 dark:text-slate-500"
                    >
                        {{ dateText(item.content) }}
                    </p>

                    <!-- Tags scroll horizontally when they overflow (same chip colour as the
                         category tags under the bookmark icon, without the tag icon). -->
                    <div
                        v-if="item.tags.length"
                        class="mt-0.5 flex gap-1.5 overflow-x-auto scrollbar-hide"
                    >
                        <span
                            v-for="tag in item.tags"
                            :key="tag"
                            class="shrink-0 whitespace-nowrap rounded-lg border border-yellow-500/25 bg-yellow-500/10 px-2 py-0.5 text-xs text-zinc-700 dark:bg-slate-700 dark:text-slate-100"
                        >
                            {{ tag }}
                        </span>
                    </div>
                </div>
            </RouterLink>
        </li>
    </ul>
</template>
