<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { type ContentDto } from "luminary-shared";
import LImage from "../images/LImage.vue";

const props = defineProps<{ content: ContentDto }>();

const summaryText = computed(() => props.content.summary?.trim() ?? "");
</script>

<template>
    <!-- Shared card visual: image + bottom-gradient title overlay + summary. Used by
         ReadMore's tablet+ grid cell, sized to fill it. -->
    <RouterLink
        :to="{ name: 'content', params: { slug: content.slug } }"
        class="ease-out-expo group flex h-full w-full flex-col gap-1 overflow-hidden rounded-lg bg-white shadow ring-1 ring-zinc-950/10 transition hover:shadow-lg hover:brightness-[1.15] dark:bg-slate-800 dark:ring-white/10"
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
                class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/50 to-black/0 px-2 pb-1.5 pt-6"
            >
                <h3 class="line-clamp-2 font-semibold text-white">
                    {{ content.title }}
                </h3>
            </div>
        </div>

        <p
            v-if="summaryText"
            class="line-clamp-2 px-2 pb-1 text-sm text-zinc-700 dark:text-slate-400"
        >
            {{ summaryText }}
        </p>
    </RouterLink>
</template>
