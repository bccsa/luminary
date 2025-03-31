<script setup lang="ts">
import { db, type ContentDto } from "luminary-shared";
import { DateTime } from "luxon";
import { useRouter } from "vue-router";
import LImage from "../images/LImage.vue";
import { PlayIcon } from "@heroicons/vue/24/solid";

type Props = {
    content: ContentDto;
    showPublishDate?: boolean;
    aspectRatio?: typeof LImage.aspectRatios;
    titlePosition?: "bottom" | "center";
};
const props = withDefaults(defineProps<Props>(), {
    showPublishDate: true,
    aspectRatio: "video",
    titlePosition: "bottom",
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
                >
                    <template #default>
                        <div class="w-full" v-if="titlePosition === 'bottom'">
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
                    </template>
                    <template #imageOverlay>
                        <!-- Play Icon (Only if content has a video and titlePosition is not center) -->
                        <div v-if="titlePosition !== 'center'">
                            <div
                                v-if="content.video"
                                class="absolute inset-0 flex items-center justify-center rounded-lg"
                            >
                                <PlayIcon
                                    class="relative h-8 w-8 text-black blur-sm lg:h-12 lg:w-12"
                                />
                            </div>
                            <div
                                v-if="content.video"
                                class="absolute inset-0 flex items-center justify-center rounded-lg"
                            >
                                <PlayIcon class="relative h-8 w-8 text-white lg:h-12 lg:w-12" />
                            </div>
                        </div>
                        <div
                            v-else
                            class="flex h-full max-h-full w-full max-w-full items-center justify-center overflow-clip bg-gradient-to-t from-black/50 to-black/20 text-sm font-semibold"
                        >
                            <p class="absolute m-2 text-pretty text-center text-black blur-sm">
                                {{ content.title }}
                            </p>
                            <p class="absolute m-2 text-pretty text-center text-white">
                                {{ content.title }}
                            </p>
                        </div>
                    </template>
                </LImage>
            </div>
        </div>
    </div>
</template>
