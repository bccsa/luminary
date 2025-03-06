<script setup lang="ts">
import { db, type ContentDto } from "luminary-shared";
import { DateTime } from "luxon";
import { useRouter } from "vue-router";
import LImage from "../images/LImage.vue";
import { PlayIcon } from "@heroicons/vue/24/solid";
import { PlayIcon as PlayIconOutline } from "@heroicons/vue/24/outline";

type Props = {
    content: ContentDto;
    showPublishDate?: boolean;
    aspectRatio?: typeof LImage.aspectRatios;
};
const props = withDefaults(defineProps<Props>(), {
    showPublishDate: true,
    aspectRatio: "video",
});

const router = useRouter();

const openContent = () => {
    router.push({ name: "content", params: { slug: props.content.slug } });
};
</script>

<template>
    <div @click="openContent" class="ease-out-expo group transition hover:brightness-[1.15]">
        <div class="avoid-inside ease-out-expo -m-2 cursor-pointer p-2 active:shadow-inner">
            <!-- Image Wrapper (Ensures Play Icon Stays on the Image) -->
            <div class="relative">
                <LImage
                    :image="content.parentImageData"
                    :aspectRatio="aspectRatio"
                    size="thumbnail"
                />

                <!-- Play Icon (Only if content has a video) -->
                <div
                    v-if="content.video"
                    class="absolute inset-0 flex items-center justify-center rounded-lg"
                >
                    <PlayIcon class="relative h-8 w-8 text-white lg:h-12 lg:w-12" />
                </div>
                <div
                    v-if="content.video"
                    class="absolute inset-0 flex items-center justify-center rounded-lg"
                >
                    <PlayIconOutline
                        class="relative z-20 h-8 w-8 stroke-1 text-zinc-600 dark:text-slate-600 lg:h-12 lg:w-12"
                    />
                </div>
            </div>

            <!-- Content Title -->
            <div class="w-full">
                <h3 class="mt-1 truncate text-sm text-zinc-800 dark:text-slate-50">
                    {{ content.title }}
                </h3>
                <div
                    v-if="showPublishDate && content.parentPublishDateVisible"
                    class="mt-0.5 text-xs text-zinc-500 dark:text-slate-400"
                >
                    {{
                        content.publishDate
                            ? db
                                  .toDateTime(content.publishDate!)
                                  .toLocaleString(DateTime.DATETIME_MED)
                            : ""
                    }}
                </div>
            </div>
        </div>
    </div>
</template>
