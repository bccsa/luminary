<script setup lang="ts">
import { db, type ContentDto } from "luminary-shared";
import { DateTime } from "luxon";
import LImage from "../images/LImage.vue";
import { PlayIcon } from "@heroicons/vue/24/solid";
import { getMediaDuration, getMediaProgress } from "@/globalConfig";
import { ref } from "vue";

type Props = {
    content: ContentDto;
    showPublishDate?: boolean;
    aspectRatio?: typeof LImage.aspectRatios;
    titlePosition?: "bottom" | "center";
    showProgress?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    showPublishDate: true,
    aspectRatio: "video",
    titlePosition: "bottom",
    showProgress: false,
});

const media = ref<{ progress: number; duration: number }>({
    progress: 0,
    duration: 0,
});

function formatDuration(seconds: number): string {
    const totalSeconds = Math.floor(seconds);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    } else {
        return `${mins.toString().padStart(1, "0")}:${secs.toString().padStart(2, "0")}`;
    }
}

const durationText = ref("");
const hasProgress = ref(false);

if (props.content.video) {
    const allMedia = localStorage.getItem("mediaProgress");

    if (allMedia) {
        const mediaProgress = getMediaProgress(props.content.video, props.content._id);
        const mediaDuration = getMediaDuration(props.content.video, props.content._id);

        if (mediaProgress > 0 && mediaDuration > 0) {
            hasProgress.value = true;
            media.value.progress = Math.min(100, (mediaProgress / mediaDuration) * 100);
            media.value.duration = mediaDuration;
            durationText.value = formatDuration(mediaDuration);
        } else {
            hasProgress.value = false; // fallback if duration is 0
        }
    } else {
        hasProgress.value = false;
    }
}
</script>

<template>
    <RouterLink
        :to="{ name: 'content', params: { slug: props.content.slug } }"
        class="ease-out-expo group transition hover:brightness-[1.15]"
    >
        <div class="avoid-inside ease-out-expo -m-2 cursor-pointer p-2 active:shadow-inner">
            <!-- Image Wrapper (Ensures Play Icon Stays on the Image) -->
            <div class="relative">
                <LImage
                    :image="content.parentImageData"
                    :content-parent-id="content.parentId"
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
                            <p
                                class="absolute m-2 text-pretty text-center text-white dark:text-slate-200"
                            >
                                {{ content.title }}
                            </p>
                        </div>

                        <!-- Bottom overlay: progress bar + duration on same line -->
                        <div
                            v-if="showProgress && content.video && hasProgress"
                            class="absolute bottom-2 left-0 right-0 z-10 mx-1 rounded-md bg-black/50 px-1"
                        >
                            <div class="flex h-4 w-full items-center gap-2">
                                <!-- Progress bar -->
                                <div
                                    class="relative h-2 flex-1 overflow-hidden rounded bg-zinc-600"
                                >
                                    <div
                                        class="absolute left-0 top-0 h-full bg-white"
                                        :style="{ width: `${media.progress}%` }"
                                    ></div>
                                </div>

                                <!-- Duration text -->
                                <span class="whitespace-nowrap text-xs text-white">
                                    {{ durationText }}
                                </span>
                            </div>
                        </div>
                    </template>
                </LImage>
            </div>
        </div>
    </RouterLink>
</template>
