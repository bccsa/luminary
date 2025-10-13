<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { type ContentDto, db, type LanguageDto } from "luminary-shared";
import {
    PlayIcon,
    PauseIcon,
    ChevronDownIcon,
    ChevronDoubleLeftIcon,
    ChevronDoubleRightIcon,
    LanguageIcon,
    XMarkIcon,
} from "@heroicons/vue/20/solid";
import LImage from "@/components/images/LImage.vue";
import { DateTime } from "luxon";
import { nextInMediaQueue, clearMediaQueue } from "@/globalConfig";

const isExpanded = ref(true); // Controls whether player shows expanded or minimal view
const isPlaying = ref(false);
const audioElement = ref<HTMLAudioElement | null>(null);

// progress states
const currentTime = ref(0);
const duration = ref(0);

type Props = {
    content: ContentDto;
};

const props = defineProps<Props>();

// Language switcher state
const showLanguageDropdown = ref(false);
const selectedLanguageId = ref(props.content.language);
const isLanguageSwitching = ref(false);

// Available languages for this content
const availableLanguages = ref<LanguageDto[]>([]);
const availableAudioLanguages = computed(() => {
    if (!props.content.parentMedia?.fileCollections) return [];

    const audioLanguageIds = props.content.parentMedia.fileCollections.map((fc) => fc.languageId);
    return availableLanguages.value.filter((lang) => audioLanguageIds.includes(lang._id));
});

const togglePlay = async () => {
    if (!audioElement.value) return;

    if (isPlaying.value) {
        audioElement.value.pause();
        isPlaying.value = false;
    } else {
        try {
            await audioElement.value.play();
            isPlaying.value = true;
        } catch (err) {
            console.error("Play failed:", err);
        }
    }
};

const toggleExpand = () => {
    isExpanded.value = !isExpanded.value;
};

const closePlayer = () => {
    // Pause audio if playing
    if (audioElement.value && isPlaying.value) {
        audioElement.value.pause();
    }
    // Clear the media queue to hide the player
    clearMediaQueue();
};

// Language switching
const switchLanguage = (languageId: string) => {
    if (!audioElement.value || selectedLanguageId.value === languageId) return;

    // Set flag to indicate we're manually switching languages
    isLanguageSwitching.value = true;

    // Store current playback state
    const wasPlaying = isPlaying.value;
    const currentPosition = audioElement.value.currentTime;

    // Pause current audio
    audioElement.value.pause();

    // Switch language (this will trigger the matchAudioFileUrl computed to change)
    selectedLanguageId.value = languageId;
    showLanguageDropdown.value = false;

    // Wait for the new audio source to load and restore playback state
    const handleNewAudioReady = () => {
        if (audioElement.value) {
            // Set the same position in the new audio
            audioElement.value.currentTime = currentPosition;

            // Resume playing if it was playing before
            if (wasPlaying) {
                audioElement.value.play().catch((err) => {
                    console.error("Failed to resume playback after language switch:", err);
                });
            }

            // Clear the language switching flag
            isLanguageSwitching.value = false;

            // Remove the event listener as it's only needed once
            audioElement.value.removeEventListener("loadedmetadata", handleNewAudioReady);
        }
    };

    // Add event listener for when the new audio is ready
    if (audioElement.value) {
        audioElement.value.addEventListener("loadedmetadata", handleNewAudioReady);
    }
};

// Load available languages
const loadAvailableLanguages = async () => {
    try {
        const languages = await db.docs.where("type").equals("language").toArray();
        availableLanguages.value = languages as LanguageDto[];
    } catch (error) {
        console.error("Failed to load languages:", error);
    }
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
    // Load available languages
    loadAvailableLanguages();

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

        // Auto-advance to next track when current track ends
        el.addEventListener("ended", () => {
            nextInMediaQueue();
        });

        // Auto-play when the component mounts (when first added to queue)
        el.addEventListener(
            "canplaythrough",
            () => {
                if (!isPlaying.value) {
                    el.play().catch((err) => {
                        console.log("Auto-play blocked by browser:", err);
                    });
                }
            },
            { once: true },
        );
    }
});

// Auto-play when content changes
watch(
    () => props.content,
    async (newContent, oldContent) => {
        if (newContent && (!oldContent || newContent._id !== oldContent._id)) {
            // Reset progress when content changes
            currentTime.value = 0;
            duration.value = 0;

            // Wait for the audio element to load the new source, then auto-start playing
            if (audioElement.value) {
                const tryToPlay = async () => {
                    try {
                        // Wait a bit for the audio source to be loaded
                        await new Promise((resolve) => setTimeout(resolve, 100));
                        await audioElement.value!.play();
                        console.log("Auto-play started successfully");
                    } catch (err) {
                        console.error("Auto-play failed:", err);
                        // Some browsers block auto-play, but that's okay
                    }
                };

                // If the audio is already loaded, play immediately
                if (audioElement.value.readyState >= 2) {
                    await tryToPlay();
                } else {
                    // Wait for the audio to be loaded
                    const handleCanPlay = async () => {
                        audioElement.value!.removeEventListener("canplay", handleCanPlay);
                        await tryToPlay();
                    };
                    audioElement.value.addEventListener("canplay", handleCanPlay);
                }
            }
        }
    },
    { immediate: true },
);

onUnmounted(() => {
    if (audioElement.value) {
        audioElement.value.pause();
    }
});

// Drag functionality for mobile swipe-to-collapse
const startY = ref(0);
const currentY = ref(0);
const isDragging = ref(false);

const onPointerDown = (e: PointerEvent) => {
    startY.value = e.clientY;
    currentY.value = 0;
    isDragging.value = true;
};

const onPointerMove = (e: PointerEvent) => {
    if (!isDragging.value) return;

    const deltaY = e.clientY - startY.value;

    if (deltaY > 0) {
        // Only prevent scrolling if dragging downward enough
        e.preventDefault();
        currentY.value = deltaY;
    } else {
        currentY.value = 0;
    }
};

const onPointerUp = () => {
    if (isDragging.value && currentY.value > 80) {
        toggleExpand(); // collapse the player
    }
    currentY.value = 0;
    isDragging.value = false;
};

const onPointerLeave = () => {
    if (isDragging.value) {
        currentY.value = 0;
        isDragging.value = false;
    }
};

// write a computed function that will assign the file url of the file collection where the languageId matches the selected language
const matchAudioFileUrl = computed(() => {
    if (
        props.content.parentMedia &&
        props.content.parentMedia.fileCollections &&
        selectedLanguageId.value
    ) {
        const matchedFile = props.content.parentMedia.fileCollections.find(
            (file) => file.languageId === selectedLanguageId.value,
        );
        return matchedFile?.fileUrl;
    }
    return props.content.parentMedia?.fileCollections?.[0]?.fileUrl;
});

// Also watch for audio URL changes and auto-play (but not during manual language switching)
watch(matchAudioFileUrl, async (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl && audioElement.value && !isLanguageSwitching.value) {
        // Small delay to let the audio element load the new source
        setTimeout(async () => {
            try {
                if (audioElement.value && !isLanguageSwitching.value) {
                    await audioElement.value.play();
                }
            } catch (err) {
                // Auto-play failed (normal in some browsers)
            }
        }, 200);
    }
});
</script>

<template>
    <div class="">
        <!-- Hidden audio element -->
        <audio ref="audioElement" :src="matchAudioFileUrl" preload="auto" class="hidden" />

        <!-- Expanded Player -->
        <transition name="slide-up">
            <div v-show="isExpanded"
                class="expanded-player flex max-h-[80vh] w-full flex-col overflow-auto bg-amber-100/95 scrollbar-hide dark:bg-slate-600 lg:inset-x-0 lg:bottom-6 lg:mx-auto lg:max-h-none lg:w-80 lg:rounded-2xl"
                :style="{
                    transform: currentY ? `translateY(${currentY}px)` : 'none', // Apply downward translation during drag
                    transition: isDragging ? 'none' : 'transform 0.3s ease-out', // Smooth transition when not dragging
                }">
                <div>
                    <!-- Swipe-down handle (drag area only) - allows users to drag down to collapse the player on mobile -->
                    <div class="flex cursor-grab justify-center pb-2 pt-1 active:cursor-grabbing lg:hidden"
                        @pointerdown.stop="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp"
                        @pointercancel="onPointerUp" @pointerleave="onPointerLeave">
                        <div class="mt-1 h-1.5 w-32 rounded-full bg-zinc-400 opacity-50 dark:bg-slate-400"></div>
                    </div>

                    <!-- Header -->
                    <div class="flex items-center p-2 lg:px-2" :class="{
                        'justify-between': availableAudioLanguages.length >= 0,
                    }">
                        <button @click="toggleExpand" class="hidden p-0.5 lg:block">
                            <ChevronDownIcon class="h-9 w-9" />
                        </button>

                        <!-- Empty div for mobile to keep centering -->
                        <!-- <div class="lg:hidden"></div> -->

                        <!-- Language Dropdown -->
                        <div v-if="availableAudioLanguages.length > 1" class="relative">
                            <button @click="showLanguageDropdown = !showLanguageDropdown"
                                class="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-black/10 dark:hover:bg-white/10">
                                <LanguageIcon class="h-4 w-4" />
                                {{
                                    availableAudioLanguages.find(
                                        (l) => l._id === selectedLanguageId,
                                    )?.name
                                }}
                            </button>

                            <div v-if="showLanguageDropdown"
                                class="absolute left-0 z-10 mt-1 w-32 rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-slate-700">
                                <button v-for="language in availableAudioLanguages" :key="language._id"
                                    @click="switchLanguage(language._id)"
                                    class="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-slate-600"
                                    :class="{
                                        'bg-yellow-50 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200':
                                            selectedLanguageId === language._id,
                                    }">
                                    {{ language.name }}
                                </button>
                            </div>
                        </div>

                        <div class="flex items-center">
                            <button @click="closePlayer" class="rounded p-1 hover:bg-black/10 dark:hover:bg-white/10">
                                <XMarkIcon class="h-6 w-6 text-gray-600 dark:text-zinc-300" />
                            </button>
                        </div>
                    </div>

                    <!-- Cover Image -->
                    <div class="flex justify-center opacity-100 transition-opacity duration-500 ease-out">
                        <LImage v-if="content.parentImageData" :image="content.parentImageData"
                            :contentParentId="content.parentId" :rounded="true" size="thumbnail" aspectRatio="square" />
                    </div>

                    <div class="p-2 pb-4">
                        <!-- Title and Author -->
                        <div class="space-y-1 text-center">
                            <span v-if="content.author"
                                class="block min-w-0 truncate text-xs font-semibold uppercase tracking-[0.1rem] text-yellow-600">
                                {{ content.author }}
                            </span>
                            <span class="block min-w-0 truncate text-lg font-bold text-zinc-600 dark:text-slate-300">
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

                        <!-- Progress bar -->
                        <div class="flex flex-col px-2 pt-2">
                            <div class="inline-block h-[6px] w-full cursor-pointer rounded-[10px] bg-zinc-400" @click="
                                (e) => {
                                    const rect = (
                                        e.target as HTMLElement
                                    ).getBoundingClientRect();
                                    const clickX = e.clientX - rect.left;
                                    const newTime = (clickX / rect.width) * duration;
                                    if (audioElement) audioElement.currentTime = newTime;
                                }
                            ">
                                <div class="h-full rounded-[10px] bg-yellow-500"
                                    :style="{ width: (currentTime / duration) * 100 + '%' }"></div>
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
                            <div class="flex items-center justify-center space-x-8 text-black dark:text-white">
                                <button class="flex items-center space-x-0" @click="skip(-10)">
                                    <ChevronDoubleLeftIcon class="h-5 w-5" />
                                    <span
                                        class="rounded-2xl bg-black px-1 py-0.5 text-sm text-white dark:bg-white dark:text-black">10</span>
                                </button>
                                <button @click="togglePlay" class="rounded-full p-3">
                                    <PlayIcon v-if="!isPlaying" class="h-12 w-12" />
                                    <PauseIcon v-else class="h-12 w-12" />
                                </button>
                                <button class="flex items-center space-x-0" @click="skip(10)">
                                    <span
                                        class="rounded-3xl bg-black px-1 py-0.5 text-sm text-white dark:bg-white dark:text-black">10</span>
                                    <ChevronDoubleRightIcon class="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </transition>

        <!-- Minimal Player -->
        <div v-if="!isExpanded" @click="toggleExpand"
            class="flex w-full cursor-pointer items-center justify-between bg-amber-100 p-2 dark:bg-slate-600 lg:mx-auto lg:w-80 lg:rounded-lg">
            <div class="flex min-w-0 items-center space-x-2">
                <LImage v-if="content.parentImageData" :image="content.parentImageData"
                    :contentParentId="content.parentId" size="smallSquare" aspectRatio="square" />

                <div class="flex min-w-0 flex-col">
                    <span class="block min-w-0 truncate text-sm font-semibold">
                        {{ content.title }}
                    </span>
                    <span v-if="content.author || content.summary"
                        class="block min-w-0 truncate text-xs text-zinc-600 dark:text-slate-400">
                        {{ content.author || content.summary }}
                    </span>
                    <span v-else class="block min-w-0 truncate text-xs text-zinc-400 dark:text-slate-300">
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

            <div class="flex items-center gap-4">
                <button @click.stop="togglePlay" class="ml-2 flex-shrink-0 rounded-full bg-transparent p-0">
                    <PlayIcon v-if="!isPlaying" class="h-7 w-7" />
                    <PauseIcon v-else class="h-7 w-7" />
                </button>
                <button @click.stop="closePlayer"
                    class="flex-shrink-0 rounded-full bg-transparent p-0 hover:bg-black/10 dark:hover:bg-white/10">
                    <XMarkIcon class="h-6 w-6 text-gray-600 dark:text-zinc-300" />
                </button>
            </div>
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
    touch-action: pan-x;
    /* only block horizontal gestures; vertical scroll allowed */
    user-select: none;
    overscroll-behavior: contain;
    /* prevent scroll chaining to parent while dragging */
}
</style>
