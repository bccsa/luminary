<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { type ContentDto, db } from "luminary-shared";
import {
    PlayIcon,
    PauseIcon,
    ChevronDownIcon,
    EllipsisVerticalIcon,
    ChevronDoubleLeftIcon,
    ChevronDoubleRightIcon,
} from "@heroicons/vue/20/solid";
import LImage from "@/components/images/LImage.vue";
import { DateTime } from "luxon";

const isExpanded = ref(false);
const isPlaying = ref(false);
const audioElement = ref<HTMLAudioElement | null>(null);

// progress states
const currentTime = ref(0);
const duration = ref(0);

type Props = {
    content: ContentDto;
};

const props = defineProps<Props>();

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

const startY = ref(0);
const currentY = ref(0);
const isDragging = ref(false);

const onPointerDown = (e: PointerEvent) => {
    startY.value = e.clientY;
    isDragging.value = false;
};

const onPointerMove = (e: PointerEvent) => {
    const deltaY = e.clientY - startY.value;

    if (deltaY > 0) {
        // Only prevent scrolling if dragging downward enough
        e.preventDefault();
        isDragging.value = true;
        currentY.value = deltaY;
    }
};

const onPointerUp = () => {
    if (isDragging.value && currentY.value > 80) {
        toggleExpand(); // collapse the player
    }
    currentY.value = 0;
    isDragging.value = false;
};

const selectAudio = (index: number) => {
    if (!props.content.parentMedia?.fileCollections || !audioElement.value) return;

    const selectedAudio = props.content.parentMedia.fileCollections[index];
    if (selectedAudio && selectedAudio.fileUrl) {
        audioElement.value.src = selectedAudio.fileUrl;
        audioElement.value.play().catch((err) => {
            console.error("Play failed:", err);
        });
    }
};
</script>

<template>
    <div class="left-0 right-0 z-40 lg:fixed lg:bottom-6 lg:left-auto lg:right-6 lg:rounded-lg">
        <!-- Hidden audio element -->
        <audio
            ref="audioElement"
            :src="content.parentMedia?.fileCollections[1].fileUrl"
            preload="auto"
            class="hidden"
        />

        <!-- Expanded Player -->
        <transition name="slide-up">
            <div
                v-show="isExpanded"
                class="expanded-player z-50 flex w-full flex-col bg-amber-100/95 dark:bg-slate-600 lg:inset-x-0 lg:bottom-6 lg:mx-auto lg:w-80 lg:rounded-2xl"
                :style="{
                    transform: currentY ? `translateY(${currentY}px)` : 'none',
                    transition: isDragging ? 'none' : 'transform 0.3s ease-out',
                }"
            >
                <div>
                    <!-- Swipe-down handle (drag area only) -->
                    <div
                        class="flex cursor-grab justify-center pb-6 pt-1 active:cursor-grabbing lg:hidden"
                        @pointerdown.stop="onPointerDown"
                        @pointermove="onPointerMove"
                        @pointerup="onPointerUp"
                        @pointercancel="onPointerUp"
                    >
                        <div
                            class="mt-1 h-1.5 w-32 rounded-full bg-zinc-400 opacity-50 dark:bg-slate-400"
                        ></div>
                    </div>

                    <!-- Header -->
                    <div class="hidden items-center justify-between px-2 lg:flex">
                        <button @click="toggleExpand" class="p-0.5">
                            <ChevronDownIcon class="h-9 w-9" />
                        </button>
                        <EllipsisVerticalIcon class="h-6 w-6 text-gray-600 dark:text-zinc-300" />
                    </div>

                    <!-- Cover Image -->
                    <div
                        class="flex justify-center opacity-100 transition-opacity duration-500 ease-out"
                    >
                        <LImage
                            v-if="content.parentImageData"
                            :image="content.parentImageData"
                            :contentParentId="content.parentId"
                            :rounded="true"
                            size="thumbnail"
                            aspectRatio="square"
                        />
                    </div>

                    <div class="p-2 pb-4">
                        <!-- Title and Author -->
                        <div class="space-y-1 text-center">
                            <span
                                v-if="content.author"
                                class="block min-w-0 truncate text-xs font-semibold uppercase tracking-[0.1rem] text-yellow-600"
                            >
                                {{ content.author }}
                            </span>
                            <span
                                class="block min-w-0 truncate text-lg font-bold text-zinc-600 dark:text-slate-300"
                            >
                                {{ content.title }}
                            </span>
                            <span
                                class="block min-w-0 truncate text-xs font-semibold text-zinc-400"
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

                        <!-- Progress bar -->
                        <div class="flex flex-col px-2 pt-2">
                            <div
                                class="inline-block h-[6px] w-full cursor-pointer rounded-[10px] bg-zinc-400"
                                @click="
                                    (e) => {
                                        const rect = (
                                            e.target as HTMLElement
                                        ).getBoundingClientRect();
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
                                <span class="text-xs text-gray-400 dark:text-zinc-300">
                                    {{ formatTime(currentTime) }}
                                </span>
                                <span class="text-xs text-gray-400 dark:text-zinc-300">
                                    {{ formatTime(duration) }}
                                </span>
                            </div>
                        </div>

                        <!-- Controls -->
                        <div class="my-1">
                            <div
                                class="flex items-center justify-center space-x-8 text-black dark:text-white"
                            >
                                <button class="flex items-center space-x-0" @click="skip(-10)">
                                    <ChevronDoubleLeftIcon class="h-5 w-5" />
                                    <span
                                        class="rounded-2xl bg-black px-1 py-0.5 text-sm text-white dark:bg-white dark:text-black"
                                        >10</span
                                    >
                                </button>
                                <button @click="togglePlay" class="rounded-full p-3">
                                    <PlayIcon v-if="!isPlaying" class="h-12 w-12" />
                                    <PauseIcon v-else class="h-12 w-12" />
                                </button>
                                <button class="flex items-center space-x-0" @click="skip(10)">
                                    <span
                                        class="rounded-3xl bg-black px-1 py-0.5 text-sm text-white dark:bg-white dark:text-black"
                                        >10</span
                                    >
                                    <ChevronDoubleRightIcon class="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- List of audios -->
                <div class="flex flex-col">
                    <div
                        v-for="(audio, index) in content.parentMedia?.fileCollections"
                        :key="index"
                        @click="selectAudio(index)"
                        class="flex items-center justify-between border-b border-gray-200 p-2"
                        :class="{
                            'bg-yellow-300 dark:bg-slate-500': audioElement?.src === audio.fileUrl,
                            'hover:bg-gray-100 dark:hover:bg-slate-700':
                                audioElement?.src !== audio.fileUrl,
                        }"
                    >
                        <span class="font-small text-sm">{{ audio.filename }}</span>
                    </div>
                </div>
            </div>
        </transition>

        <!-- Minimal Player -->
        <div
            v-if="!isExpanded"
            @click="toggleExpand"
            class="flex w-full cursor-pointer items-center justify-between bg-amber-100 p-2 dark:bg-slate-600 lg:mx-auto lg:w-80 lg:rounded-lg"
        >
            <div class="flex min-w-0 items-center space-x-2">
                <LImage
                    v-if="content.parentImageData"
                    :image="content.parentImageData"
                    :contentParentId="content.parentId"
                    size="smallSquare"
                    aspectRatio="square"
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
    </div>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
    transition:
        transform 0.3s ease-out,
        opacity 0.3s ease-out;
}
.slide-up-enter-from,
.slide-up-leave-to {
    transform: translateY(100%);
    opacity: 0;
}
.slide-up-enter-to,
.slide-up-leave-from {
    transform: translateY(0%);
    opacity: 1;
}

/* Make sure the div allows vertical drag */
.expanded-player {
    touch-action: pan-x; /* only block horizontal gestures; vertical scroll allowed */
    user-select: none;
    overscroll-behavior: contain; /* prevent scroll chaining to parent while dragging */
}
</style>
