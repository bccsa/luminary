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

// Prefer the summary; fall back to the publish date so a post with no summary isn't
// left blank. The summary itself is clamped to two lines in the template.
const subtitle = (content: ContentDto): string => {
    const summary = content.summary?.trim();
    if (summary) return summary;
    return content.publishDate
        ? DateTime.fromMillis(content.publishDate).toLocaleString(DateTime.DATE_MED)
        : "";
};
</script>

<template>
    <!-- Dynamic columns: the grid fits as many ~18rem cards as the width allows, so it is
         one column on a phone and several on a wide screen with no fixed breakpoints. -->
    <ul class="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-x-6">
        <li
            v-for="item in items"
            :key="item.content._id"
            class="border-b border-zinc-100 last:border-b-0 dark:border-slate-700"
        >
            <RouterLink
                :to="{ name: 'content', params: { slug: item.content.slug } }"
                class="ease-out-expo group flex gap-3 py-3 transition hover:brightness-[1.15]"
            >
                <div class="w-24 shrink-0 sm:w-28">
                    <LImage
                        :image="item.content.parentImageData"
                        :content-parent-id="item.content.parentId"
                        :parent-image-bucket-id="item.content.parentImageBucketId"
                        aspectRatio="classic"
                        size="thumbnail"
                    />
                </div>

                <div class="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 class="line-clamp-2 font-semibold text-zinc-800 dark:text-slate-50">
                        {{ item.content.title }}
                    </h3>

                    <p
                        v-if="subtitle(item.content)"
                        class="line-clamp-2 text-sm text-zinc-500 dark:text-slate-400"
                    >
                        {{ subtitle(item.content) }}
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
