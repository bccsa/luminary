<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { type ContentDto } from "luminary-shared";
import LImage from "../images/LImage.vue";

const props = defineProps<{ content: ContentDto }>();

const summaryText = computed(() => props.content.summary?.trim() ?? "");
</script>

<template>
    <!-- Same card visual as ReadMore's grid card (image + bottom-gradient title overlay +
         summary) — a fixed width instead of a fluid grid cell, so several can sit side by
         side in a horizontal-scroll row (see ContentCardRow) without looking like a
         different design system from the "Read more" list right above it. -->
    <RouterLink
        :to="{ name: 'content', params: { slug: content.slug } }"
        class="ease-out-expo group flex h-full w-40 shrink-0 flex-col gap-1 overflow-hidden rounded-lg bg-white shadow ring-1 ring-zinc-950/10 transition hover:shadow-lg hover:brightness-[1.15] dark:bg-slate-800 dark:ring-white/10 sm:w-52"
    >
        <div class="relative">
            <LImage
                :image="content.parentImageData"
                :content-parent-id="content.parentId"
                :parent-image-bucket-id="content.parentImageBucketId"
                aspectRatio="classic"
                size="card"
                :rounded="false"
            />
            <div
                class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-black/0 px-2 pb-1.5 pt-6"
            >
                <h3 class="line-clamp-2 font-semibold text-white">
                    {{ content.title }}
                </h3>
            </div>
        </div>

        <p
            v-if="summaryText"
            class="line-clamp-2 px-2 pb-1 text-sm font-serif text-zinc-500 dark:text-slate-400"
        >
            {{ summaryText }}
        </p>
    </RouterLink>
</template>
