<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { type ContentDto, db } from "luminary-shared";
import {
    PlayIcon,
    PauseIcon,
    ArrowUturnRightIcon,
    ArrowUturnLeftIcon,
    ChevronDownIcon,
    EllipsisVerticalIcon,
} from "@heroicons/vue/20/solid";
import LImage from "@/components/images/LImage.vue";
import { DateTime } from "luxon";
// import music from "@/assets/7 - Når jeg i de stille stunder ser tilbake - Vekkelsessanger.mp3";

const isExpanded = ref(false);
const isPlaying = ref(false);
const audioElement = ref<HTMLAudioElement | null>(null);

// progress states
const currentTime = ref(0);
const duration = ref(0);

type Props = {
    content: ContentDto;
};

defineProps<Props>();

const togglePlay = async () => {
    if (!audioElement.value) return;

    if (isPlaying.value) {
        audioElement.value.pause();
    } else {
        try {
            await audioElement.value.play();
        } catch (err) {
            console.error("Play failed:", err);
        }
    }
};

const toggleExpand = () => {
    isExpanded.value = !isExpanded.value;
};

// skip forward/back
const skip = (seconds: number) => {
    if (audioElement.value) {
        audioElement.value.currentTime += seconds;
    }
};

// format mm:ss
const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
};

onMounted(() => {
    if (audioElement.value) {
        const el = audioElement.value;

        el.addEventListener("play", () => (isPlaying.value = true));
        el.addEventListener("pause", () => (isPlaying.value = false));

        el.addEventListener("timeupdate", () => {
            currentTime.value = el.currentTime;
        });

        el.addEventListener("loadedmetadata", () => {
            duration.value = el.duration;
        });
    }
});

onUnmounted(() => {
    if (audioElement.value) {
        audioElement.value.pause();
    }
});
</script>

<template>
    <div class="left-0 right-0 z-40 lg:fixed lg:bottom-6 lg:left-auto lg:right-6 lg:rounded-lg">
        <!-- Hidden audio element -->
        <audio ref="audioElement" :src="content.audio" preload="auto" class="hidden" />

        <!-- Minimal Player -->
        <div
            v-if="!isExpanded"
            @click="toggleExpand"
            class="flex w-full cursor-pointer items-center justify-between bg-amber-50 p-2 dark:bg-slate-600 lg:mx-auto lg:w-80 lg:rounded-lg"
        >
            <div class="flex min-w-0 flex-1 items-center space-x-2">
                <LImage
                    v-if="content.parentImageData"
                    :image="content.parentImageData"
                    :contentParentId="content.parentId"
                    size="small"
                    class="flex-shrink-0 rounded-md object-cover"
                />

                <div class="flex min-w-0 flex-col">
                    <span class="block min-w-0 truncate text-sm font-semibold">
                        {{ content.title }}
                    </span>
                    <span
                        v-if="content.author || content.summary"
                        class="block min-w-0 truncate text-xs text-zinc-600 dark:text-slate-400"
                    >
                        {{ content.author || content.summary }}
                    </span>
                    <span
                        v-else
                        class="block min-w-0 truncate text-xs text-zinc-400 dark:text-slate-300"
                    >
                        {{
                            content.publishDate
                                ? db
                                      .toDateTime(content.publishDate)
                                      .toLocaleString(DateTime.DATETIME_MED)
                                : ""
                        }}
                    </span>
                </div>
            </div>

            <button
                @click.stop="togglePlay"
                class="ml-2 flex-shrink-0 rounded-full bg-transparent p-2"
            >
                <PlayIcon v-if="!isPlaying" class="h-7 w-7" />
                <PauseIcon v-else class="h-7 w-7" />
            </button>
        </div>

        <!-- Expanded Player -->
        <transition name="slide-up">
            <div
                v-if="isExpanded"
                class="flex w-full flex-col bg-amber-50 dark:bg-slate-600 lg:mx-auto lg:w-80 lg:rounded-2xl"
            >
                <!-- Header -->
                <div
                    class="flex items-center justify-between border-b border-zinc-400 p-2 dark:border-slate-400"
                >
                    <button @click="toggleExpand" class="p-0.5">
                        <ChevronDownIcon class="h-9 w-9" />
                    </button>
                    <EllipsisVerticalIcon class="h-6 w-6 text-gray-600 dark:text-zinc-300" />
                </div>

                <!-- Cover Image -->
                <LImage
                    v-if="content.parentImageData"
                    :image="content.parentImageData"
                    :contentParentId="content.parentId"
                    :rounded="false"
                    size="post"
                />

                <div class="p-2">
                    <!-- Title and Author -->
                    <div class="pb-6 pt-2 text-center">
                        <span
                            v-if="content.author"
                            class="block min-w-0 truncate py-1.5 text-xs font-semibold uppercase tracking-[0.1rem] text-yellow-600"
                        >
                            {{ content.author }}
                        </span>
                        <span
                            class="block min-w-0 truncate text-lg font-bold text-zinc-600 dark:text-slate-300"
                        >
                            {{ content.title }}
                        </span>
                        <span class="block min-w-0 truncate text-xs font-semibold text-zinc-400">
                            {{
                                content.publishDate
                                    ? db
                                          .toDateTime(content.publishDate)
                                          .toLocaleString(DateTime.DATETIME_MED)
                                    : ""
                            }}
                        </span>
                    </div>

                    <!-- Progress bar (simplified) -->
                    <div class="flex flex-col">
                        <div
                            class="inline-block h-[6px] w-full cursor-pointer rounded-[10px] bg-zinc-400"
                            @click="
                                (e) => {
                                    // Calculate new time based on click position
                                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                                    const clickX = e.clientX - rect.left;
                                    const newTime = (clickX / rect.width) * duration;
                                    if (audioElement) audioElement.currentTime = newTime;
                                }
                            "
                        >
                            <div
                                class="h-full rounded-[10px] bg-yellow-500"
                                :style="{ width: (currentTime / duration) * 100 + '%' }"
                            ></div>
                        </div>
                        <div class="mt-1 flex justify-between">
                            <span class="text-xs text-gray-400 dark:text-zinc-300">{{
                                formatTime(currentTime)
                            }}</span>
                            <span class="text-xs text-gray-400 dark:text-zinc-300">{{
                                formatTime(duration)
                            }}</span>
                        </div>
                    </div>

                    <!-- Custom Controls -->
                    <div class="my-1">
                        <div
                            class="flex items-center justify-center space-x-14 text-black dark:text-white"
                        >
                            <button @click="skip(-10)">
                                <ArrowUturnLeftIcon class="h-6 w-6" />
                            </button>
                            <button @click="togglePlay" class="rounded-full p-3">
                                <PlayIcon v-if="!isPlaying" class="h-8 w-8" />
                                <PauseIcon v-else class="h-8 w-8" />
                            </button>
                            <button @click="skip(10)">
                                <ArrowUturnRightIcon class="h-6 w-6" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </transition>
    </div>
</template>
