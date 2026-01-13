<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { type ContentDto, db, type LanguageDto, useDexieLiveQueryWithDeps } from "luminary-shared";
import {
    PlayIcon,
    PauseIcon,
    ChevronDownIcon,
    ChevronDoubleLeftIcon,
    ChevronDoubleRightIcon,
    LanguageIcon,
    XMarkIcon,
    ExclamationTriangleIcon,
    SpeakerWaveIcon,
    SpeakerXMarkIcon,
    ArrowPathIcon,
    QuestionMarkCircleIcon,
    PlusIcon,
    MinusIcon,
} from "@heroicons/vue/20/solid";
import LImage from "@/components/images/LImage.vue";
import { DateTime } from "luxon";
import { clearMediaQueue, mediaQueue } from "@/globalConfig";

const isExpanded = ref(true); // Controls whether player shows expanded or minimal view
const isPlaying = ref(false);
const audioElement = ref<HTMLAudioElement | null>(null);

// Error state
const audioError = ref<string | null>(null);
const isLoading = ref(false);
const connectionError = ref(false);
const retryCount = ref(0);
const maxRetries = 3;
const canRetry = ref(true);

// Volume and playback speed controls
const volume = ref(1);
const isMuted = ref(false);
const playbackRate = ref(1);
const showHelpModal = ref(false);

// progress states
const currentTime = ref(0);
const duration = ref(0);

// seeking states for progress bar drag functionality
const isSeeking = ref(false);
const seekTime = ref(0);

// Volume slider state
const isVolumeSliding = ref(false);
const volumeSlideValue = ref(1);
const showVolumeSlider = ref(false);

const content = defineModel<ContentDto>("content", { required: true });

// Create a live query to keep the content up-to-date with database changes
// This ensures the image and other data stay fresh even if the parent post/tag is updated
// We watch the content ID so the query updates when switching tracks AND when content is updated
const liveContent = useDexieLiveQueryWithDeps(
    () => content.value._id,
    (contentId: string) => db.get<ContentDto>(contentId),
    {
        initialValue: content.value,
    },
);

// Use live content if available, otherwise fall back to model
// This ensures we always have the latest data from the database
const currentContent = computed(() => liveContent.value || content.value);

// Language switcher state
const showLanguageDropdown = ref(false);
const selectedLanguageId = ref(currentContent.value.language);
const isLanguageSwitching = ref(false);

// Available languages for this content
const availableLanguages = ref<LanguageDto[]>([]);
const availableAudioLanguages = computed(() => {
    if (!currentContent.value?.parentMedia?.fileCollections) return [];

    const audioLanguageIds = currentContent.value.parentMedia.fileCollections.map(
        (fc) => fc.languageId,
    );
    return availableLanguages.value.filter((lang) => audioLanguageIds.includes(lang._id));
});

// Enhanced error handling
const handleAudioError = (errorEvent?: Event) => {
    const audio = audioElement.value;
    if (!audio) return;

    isLoading.value = false;
    isPlaying.value = false;

    let errorMessage = "Audio playback failed";
    canRetry.value = true;

    if (audio.error) {
        switch (audio.error.code) {
            case MediaError.MEDIA_ERR_NETWORK:
                errorMessage = "Network error. Please check your internet connection.";
                connectionError.value = true;
                break;
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                errorMessage = "Audio format not supported by your browser.";
                canRetry.value = false;
                break;
            case MediaError.MEDIA_ERR_ABORTED:
                errorMessage = "Audio loading was cancelled.";
                break;
            case MediaError.MEDIA_ERR_DECODE:
                errorMessage = "Audio file is corrupted or cannot be decoded.";
                canRetry.value = false;
                break;
            default:
                errorMessage = "Unknown audio error occurred.";
        }
    }

    audioError.value = errorMessage;
    console.error("Audio error:", audio.error, errorEvent);
};

const retryAudio = async () => {
    if (!audioElement.value || retryCount.value >= maxRetries) return;

    retryCount.value++;
    audioError.value = null;
    connectionError.value = false;
    isLoading.value = true;

    try {
        // Force reload the audio source
        const currentSrc = audioElement.value.src;
        audioElement.value.src = "";
        audioElement.value.load();
        audioElement.value.src = currentSrc;

        await new Promise((resolve) => setTimeout(resolve, 500)); // Wait a bit
        await audioElement.value.play();
        isPlaying.value = true;
        retryCount.value = 0; // Reset on success
    } catch (err) {
        console.error("Retry failed:", err);
        handleAudioError();
    } finally {
        isLoading.value = false;
    }
};

// Volume controls
const toggleMute = () => {
    if (!audioElement.value) return;

    isMuted.value = !isMuted.value;
    audioElement.value.muted = isMuted.value;
    resetAutoHideTimer();
};

const changeVolume = (delta: number) => {
    if (!audioElement.value) return;

    const newVolume = Math.max(0, Math.min(1, volume.value + delta));
    volume.value = newVolume;
    audioElement.value.volume = newVolume;

    // Unmute if volume is changed
    if (newVolume > 0 && isMuted.value) {
        isMuted.value = false;
        audioElement.value.muted = false;
    }

    resetAutoHideTimer();
};

// Volume slider functionality for mobile
const volumeSliderRef = ref<HTMLElement | null>(null);

const getVolumeFromEvent = (e: MouseEvent | TouchEvent) => {
    if (!volumeSliderRef.value) return 0;

    const rect = volumeSliderRef.value.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    return percentage;
};

const startVolumeSliding = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    volumeSliderRef.value = e.currentTarget as HTMLElement;
    isVolumeSliding.value = true;
    volumeSlideValue.value = getVolumeFromEvent(e);

    // Add global event listeners for mouse/touch move and up
    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
        if (!isVolumeSliding.value) return;
        moveEvent.preventDefault();
        volumeSlideValue.value = getVolumeFromEvent(moveEvent);
    };

    const handleEnd = (endEvent: MouseEvent | TouchEvent) => {
        if (!isVolumeSliding.value) return;
        endEvent.preventDefault();
        isVolumeSliding.value = false;

        // Apply the final volume
        const newVolume = volumeSlideValue.value;
        volume.value = newVolume;
        if (audioElement.value) {
            audioElement.value.volume = newVolume;

            // Auto-unmute if volume > 0
            if (newVolume > 0 && isMuted.value) {
                isMuted.value = false;
                audioElement.value.muted = false;
            }
        }

        // Remove event listeners
        document.removeEventListener("mousemove", handleMove as EventListener);
        document.removeEventListener("touchmove", handleMove as EventListener);
        document.removeEventListener("mouseup", handleEnd as EventListener);
        document.removeEventListener("touchend", handleEnd as EventListener);

        volumeSliderRef.value = null;
        resetAutoHideTimer();
    };

    // Add the event listeners
    document.addEventListener("mousemove", handleMove as EventListener);
    document.addEventListener("touchmove", handleMove as EventListener);
    document.addEventListener("mouseup", handleEnd as EventListener);
    document.addEventListener("touchend", handleEnd as EventListener);
};

const toggleVolumeSlider = () => {
    showVolumeSlider.value = !showVolumeSlider.value;
    resetAutoHideTimer();
}; // Playback speed controls
const changePlaybackSpeed = (newRate: number) => {
    if (!audioElement.value) return;

    playbackRate.value = newRate;
    audioElement.value.playbackRate = newRate;
    resetAutoHideTimer();
};

const togglePlay = async () => {
    if (!audioElement.value) return;

    if (audioError.value) {
        // If there's an error, try to retry
        await retryAudio();
        return;
    }

    if (isPlaying.value) {
        audioElement.value.pause();
        isPlaying.value = false;
    } else {
        try {
            isLoading.value = true;
            await audioElement.value.play();
            isPlaying.value = true;
            audioError.value = null; // Clear any previous errors
        } catch (err) {
            console.error("Play failed:", err);
            handleAudioError();
        } finally {
            isLoading.value = false;
        }
    }

    // Reset auto-hide timer on user interaction
    resetAutoHideTimer();
};

const toggleExpand = () => {
    isExpanded.value = !isExpanded.value;
    // Reset auto-hide timer on user interaction
    resetAutoHideTimer();
};

const closePlayer = () => {
    // Pause audio if playing
    if (audioElement.value && isPlaying.value) {
        audioElement.value.pause();
    }
    // Clear the media queue to hide the player
    clearMediaQueue();
};

// Enhanced close with confirmation for multiple tracks
const closePlayerWithConfirmation = () => {
    if (mediaQueue.value.length > 1) {
        // Show confirmation if multiple tracks in queue
        const confirmed = confirm(
            `Close player? This will clear ${mediaQueue.value.length} tracks from your queue.`,
        );
        if (!confirmed) return;
    }
    closePlayer();
};

// Auto-hide timer for inactivity
const timer = ref<number>(3 * 60 * 1000);

const autoHideTimer = ref<number | null>(null);
const resetAutoHideTimer = () => {
    if (autoHideTimer.value) {
        clearTimeout(autoHideTimer.value);
    }
    // Auto-hide after 3 minutes of inactivity (only when minimized)
    if (!isExpanded.value) {
        const timeoutId = setTimeout(() => {
            closePlayerWithConfirmation();
        }, timer.value); // 3 minutes

        // This conversion is necessary because setTimeout in Node returns a Timeout object, while in browsers it returns a number
        autoHideTimer.value = timeoutId as unknown as number;
    }
};

// Enhanced keyboard shortcuts
const handleKeyDown = (event: KeyboardEvent) => {
    // Only handle shortcuts when player is visible
    if (mediaQueue.value.length === 0) return;

    // Don't handle shortcuts if user is typing in an input
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
    }

    switch (event.key) {
        case "Escape":
            event.preventDefault();
            if (showHelpModal.value) {
                showHelpModal.value = false;
            } else {
                closePlayerWithConfirmation();
            }
            break;

        case " ":
        case "k":
        case "K":
            // Space bar or K for play/pause
            if (event.target === document.body || !target.closest("button, input, textarea")) {
                event.preventDefault();
                togglePlay();
            }
            break;

        case "ArrowLeft":
        case "j":
        case "J":
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
                skip(-30); // Larger skip with Ctrl/Cmd
            } else if (event.shiftKey) {
                skip(-5); // Small skip with Shift
            } else {
                skip(-10); // Normal skip
            }
            break;

        case "ArrowRight":
        case "l":
        case "L":
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
                skip(30); // Larger skip with Ctrl/Cmd
            } else if (event.shiftKey) {
                skip(5); // Small skip with Shift
            } else {
                skip(10); // Normal skip
            }
            break;

        case "ArrowUp":
            event.preventDefault();
            changeVolume(0.1); // Increase volume by 10%
            break;

        case "ArrowDown":
            event.preventDefault();
            changeVolume(-0.1); // Decrease volume by 10%
            break;

        case "m":
        case "M":
            event.preventDefault();
            toggleMute();
            break;

        case "f":
        case "F":
            event.preventDefault();
            toggleExpand();
            break;

        case "r":
        case "R":
            event.preventDefault();
            if (audioError.value && retryCount.value < maxRetries) {
                retryAudio();
            }
            break;

        case "0":
            event.preventDefault();
            if (audioElement.value) {
                audioElement.value.currentTime = 0;
            }
            break;

        case "1":
            event.preventDefault();
            changePlaybackSpeed(1);
            break;

        case "2":
            event.preventDefault();
            changePlaybackSpeed(1.25);
            break;

        case "3":
            event.preventDefault();
            changePlaybackSpeed(1.5);
            break;

        case "4":
            event.preventDefault();
            changePlaybackSpeed(1.75);
            break;

        case "5":
            event.preventDefault();
            changePlaybackSpeed(2);
            break;

        case "?":
        case "/":
            event.preventDefault();
            showHelpModal.value = !showHelpModal.value;
            break;

        default:
            return; // Don't prevent default for unhandled keys
    }
};

// Language switching
const switchLanguage = (languageId: string) => {
    if (!audioElement.value || selectedLanguageId.value === languageId) return;

    // Validate that the target language has audio
    const targetAudioFile = currentContent.value.parentMedia?.fileCollections?.find(
        (file) => file.languageId === languageId,
    );
    if (!targetAudioFile) {
        console.warn(`No audio file found for language ${languageId}`);
        return;
    }

    // Set flag to indicate we're manually switching languages
    isLanguageSwitching.value = true;

    // Store current playback state
    const wasPlaying = isPlaying.value;
    const currentPosition = audioElement.value.currentTime;

    // Pause current audio
    audioElement.value.pause();
    isPlaying.value = false;

    // Switch language (this will trigger the matchAudioFileUrl computed to change)
    selectedLanguageId.value = languageId;
    showLanguageDropdown.value = false;

    // Wait for the new audio source to load and restore playback state
    const handleNewAudioReady = () => {
        if (audioElement.value && !audioElement.value.paused) {
            // Audio might have auto-started, pause it first
            audioElement.value.pause();
        }

        if (audioElement.value) {
            try {
                // Clamp the current position to the new audio's duration to prevent errors
                // if the new audio is shorter than the current position
                const newDuration = audioElement.value.duration;
                const clampedPosition =
                    isFinite(newDuration) && newDuration > 0
                        ? Math.min(currentPosition, newDuration)
                        : 0;

                // Set the clamped position in the new audio
                audioElement.value.currentTime = clampedPosition;

                // Resume playing if it was playing before
                if (wasPlaying) {
                    audioElement.value.play().catch((err) => {
                        console.error("Failed to resume playback after language switch:", err);
                        // If play fails, at least update the playing state
                        isPlaying.value = false;
                    });
                }
            } catch (error) {
                console.error("Error during language switch:", error);
                // Reset playing state on error
                isPlaying.value = false;
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

        // Add a timeout fallback in case loadedmetadata never fires
        setTimeout(() => {
            if (isLanguageSwitching.value) {
                console.warn("Language switch timeout - loadedmetadata event never fired");
                isLanguageSwitching.value = false;
                isPlaying.value = false;
            }
        }, 5000); // 5 second timeout
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
    // Reset auto-hide timer on user interaction
    resetAutoHideTimer();
};

// Progress bar seeking functionality
const progressBarRef = ref<HTMLElement | null>(null);

const getSeekTimeFromEvent = (e: MouseEvent | TouchEvent) => {
    if (!progressBarRef.value) return 0;

    const rect = progressBarRef.value.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    return percentage * duration.value;
};

const startSeeking = (e: MouseEvent | TouchEvent) => {
    if (!audioElement.value || duration.value === 0) return;

    e.preventDefault();
    e.stopPropagation();

    // Store reference to the progress bar element
    progressBarRef.value = e.currentTarget as HTMLElement;

    isSeeking.value = true;
    seekTime.value = getSeekTimeFromEvent(e);

    // Add global event listeners for mouse/touch move and up
    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
        if (!isSeeking.value) return;
        moveEvent.preventDefault();
        seekTime.value = getSeekTimeFromEvent(moveEvent);
    };

    const handleEnd = (endEvent: MouseEvent | TouchEvent) => {
        if (!isSeeking.value) return;
        endEvent.preventDefault();
        isSeeking.value = false;

        // Apply the final seek position
        if (audioElement.value) {
            audioElement.value.currentTime = seekTime.value;
        }

        // Remove event listeners
        document.removeEventListener("mousemove", handleMove as EventListener);
        document.removeEventListener("touchmove", handleMove as EventListener);
        document.removeEventListener("mouseup", handleEnd as EventListener);
        document.removeEventListener("touchend", handleEnd as EventListener);

        // Clear the progress bar reference
        progressBarRef.value = null;

        // Reset auto-hide timer on user interaction
        resetAutoHideTimer();
    };

    // Add the event listeners
    document.addEventListener("mousemove", handleMove as EventListener);
    document.addEventListener("touchmove", handleMove as EventListener);
    document.addEventListener("mouseup", handleEnd as EventListener);
    document.addEventListener("touchend", handleEnd as EventListener);
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

    // Add keyboard event listeners
    document.addEventListener("keydown", handleKeyDown);

    // Add click outside handler for volume slider
    document.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (showVolumeSlider.value && target && !target.closest(".volume-control-container")) {
            showVolumeSlider.value = false;
        }
    });

    // Reset auto-hide timer when player becomes active
    resetAutoHideTimer();

    if (audioElement.value) {
        const el = audioElement.value;

        // Playback state events
        el.addEventListener("play", () => {
            isPlaying.value = true;
            audioError.value = null;
        });

        el.addEventListener("pause", () => {
            isPlaying.value = false;
        });

        // Progress events
        el.addEventListener("timeupdate", () => {
            currentTime.value = el.currentTime;
        });

        el.addEventListener("loadedmetadata", () => {
            duration.value = el.duration;
            // Apply stored volume and playback rate
            el.volume = volume.value;
            el.muted = isMuted.value;
            el.playbackRate = playbackRate.value;
        });

        // Loading events
        el.addEventListener("loadstart", () => {
            isLoading.value = true;
            audioError.value = null;
            connectionError.value = false;
        });

        el.addEventListener("canplay", () => {
            isLoading.value = false;
            retryCount.value = 0; // Reset retry count on successful load
        });

        el.addEventListener("waiting", () => {
            isLoading.value = true;
        });

        el.addEventListener("playing", () => {
            isLoading.value = false;
        });

        // Error handling
        el.addEventListener("error", handleAudioError);

        el.addEventListener("stalled", () => {
            connectionError.value = true;
        });

        // Keep player visible when current track ends
        el.addEventListener("ended", () => {
            isPlaying.value = false;
            // Player stays visible - user can replay, switch tracks, or close manually
        });

        // Auto-play when the component mounts (when first added to queue)
        el.addEventListener(
            "canplaythrough",
            () => {
                if (!isPlaying.value) {
                    el.play().catch((err) => {
                        console.log("Auto-play blocked by browser:", err);
                        // Don't treat browser auto-play blocking as an error
                    });
                }
            },
            { once: true },
        );
    }
});

onUnmounted(() => {
    // Remove keyboard event listeners
    document.removeEventListener("keydown", handleKeyDown);

    // Clear auto-hide timer
    if (autoHideTimer.value) {
        clearTimeout(autoHideTimer.value);
    }
});

// Auto-play when content changes (watch both model and live query)
watch(
    [() => content.value._id, () => currentContent.value],
    async ([newId, newContent], [oldId, oldContent]) => {
        // Only reset if it's a different content (new track)
        if (newId && oldId && newId !== oldId) {
            // Reset states when content changes
            currentTime.value = 0;
            duration.value = 0;
            audioError.value = null;
            retryCount.value = 0;
            connectionError.value = false;
        }

        // Update selectedLanguageId when content language changes
        if (newContent?.language && newContent.language !== selectedLanguageId.value) {
            selectedLanguageId.value = newContent.language;
        }

        if (newContent && (!oldContent || newContent._id !== oldContent?._id)) {
            // Wait for the audio element to load the new source, then auto-start playing
            if (audioElement.value) {
                const tryToPlay = async () => {
                    try {
                        isLoading.value = true;
                        // Wait a bit for the audio source to be loaded
                        await new Promise((resolve) => setTimeout(resolve, 100));
                        await audioElement.value!.play();
                        console.log("Auto-play started successfully");
                    } catch (err) {
                        console.error("Auto-play failed:", err);
                        // Some browsers block auto-play, but that's okay - don't show error
                    } finally {
                        isLoading.value = false;
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
        currentContent.value.parentMedia &&
        currentContent.value.parentMedia.fileCollections &&
        selectedLanguageId.value
    ) {
        const matchedFile = currentContent.value.parentMedia.fileCollections.find(
            (file) => file.languageId === selectedLanguageId.value,
        );
        return matchedFile?.fileUrl;
    }
    return currentContent.value.parentMedia?.fileCollections?.[0]?.fileUrl;
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

        <!-- Screen reader status announcements -->
        <div class="sr-only" aria-live="polite" aria-atomic="true">
            {{ isPlaying ? "Playing" : "Paused" }}: {{ currentContent.title }} by
            {{ currentContent.author }}
            <span v-if="audioError">Error: {{ audioError }}</span>
            <span v-if="isLoading">Loading audio...</span>
            <span v-if="connectionError">Connection issues detected</span>
            <span v-if="isMuted">Audio muted</span>
            <span v-else>Volume: {{ Math.round(volume * 100) }}%</span>
            <span>Playback speed: {{ playbackRate }}x</span>
        </div>

        <!-- Expanded Player -->
        <transition name="slide-up">
            <div
                v-show="isExpanded"
                class="expanded-player flex max-h-[80vh] w-full flex-col justify-items-end overflow-auto bg-amber-50 shadow-2xl shadow-black/20 scrollbar-hide dark:bg-slate-600 lg:inset-x-0 lg:max-h-none lg:w-80 lg:rounded-2xl"
                :style="{
                    transform: currentY ? `translateY(${currentY}px)` : 'none', // Apply downward translation during drag
                    transition: isDragging ? 'none' : 'transform 0.3s ease-out', // Smooth transition when not dragging
                }"
            >
                <div class="">
                    <!-- Swipe-down handle (drag area only) - allows users to drag down to collapse the player on mobile -->
                    <div
                        class="flex cursor-grab justify-center pb-2 pt-1 active:cursor-grabbing lg:hidden"
                        @pointerdown.stop="onPointerDown"
                        @pointermove="onPointerMove"
                        @pointerup="onPointerUp"
                        @pointercancel="onPointerUp"
                        @pointerleave="onPointerLeave"
                    >
                        <div
                            class="mt-1 h-1.5 w-32 rounded-full bg-zinc-400 opacity-50 dark:bg-slate-400"
                        ></div>
                    </div>

                    <!-- Header -->
                    <div
                        class="flex items-center p-2 px-6 lg:px-3"
                        :class="{
                            'justify-between': availableAudioLanguages.length >= 0,
                        }"
                    >
                        <button @click="toggleExpand" class="p-0.5">
                            <ChevronDownIcon class="h-9 w-9" />
                        </button>

                        <!-- Empty div for mobile to keep centering -->
                        <!-- <div class="lg:hidden"></div> -->

                        <!-- Language Dropdown -->
                        <div v-if="availableAudioLanguages.length > 1" class="relative">
                            <button
                                @click="showLanguageDropdown = !showLanguageDropdown"
                                class="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-black/10 dark:hover:bg-white/10"
                            >
                                <LanguageIcon class="h-4 w-4" />
                                {{
                                    availableAudioLanguages.find(
                                        (l) => l._id === selectedLanguageId,
                                    )?.name
                                }}
                            </button>

                            <div
                                v-if="showLanguageDropdown"
                                class="absolute left-0 z-10 mt-1 w-32 rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-slate-700"
                            >
                                <button
                                    v-for="language in availableAudioLanguages"
                                    :key="language._id"
                                    @click="switchLanguage(language._id)"
                                    class="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-slate-600"
                                    :class="{
                                        'bg-yellow-50 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200':
                                            selectedLanguageId === language._id,
                                    }"
                                >
                                    {{ language.name }}
                                </button>
                            </div>
                        </div>

                        <div class="flex items-center">
                            <button
                                @click="closePlayerWithConfirmation"
                                class="rounded p-1 hover:bg-black/10 dark:hover:bg-white/10"
                            >
                                <XMarkIcon class="h-6 w-6" />
                            </button>
                        </div>
                    </div>

                    <!-- Cover Image -->
                    <div
                        class="flex justify-center opacity-100 transition-opacity duration-500 ease-out"
                    >
                        <LImage
                            v-if="currentContent.parentImageData"
                            :image="currentContent.parentImageData"
                            :contentParentId="currentContent.parentId"
                            :parentImageBucketId="currentContent.parentImageBucketId"
                            :rounded="true"
                            size="thumbnail"
                            aspectRatio="square"
                        />
                    </div>

                    <div class="p-2 pb-4">
                        <!-- Title and Author -->
                        <div class="space-y-1 text-center">
                            <span
                                v-if="currentContent.author"
                                class="block min-w-0 truncate text-xs font-semibold uppercase tracking-[0.1rem] text-yellow-600"
                            >
                                {{ currentContent.author }}
                            </span>
                            <span
                                class="block min-w-0 truncate text-lg font-bold text-zinc-600 dark:text-slate-300"
                            >
                                {{ currentContent.title }}
                            </span>
                            <span
                                class="block min-w-0 truncate text-xs font-semibold text-zinc-400"
                            >
                                {{
                                    currentContent.publishDate
                                        ? db
                                              .toDateTime(currentContent.publishDate)
                                              .toLocaleString(DateTime.DATETIME_MED)
                                        : ""
                                }}
                            </span>
                        </div>

                        <!-- Progress bar -->
                        <div class="flex flex-col px-6 pt-3">
                            <div
                                class="inline-block h-[6px] w-full cursor-pointer select-none rounded-[10px] bg-zinc-400"
                                @mousedown="startSeeking"
                                @touchstart="startSeeking"
                            >
                                <div
                                    class="h-full rounded-[10px] bg-yellow-500 transition-all duration-75"
                                    :style="{
                                        width: isSeeking
                                            ? (seekTime / duration) * 100 + '%'
                                            : (currentTime / duration) * 100 + '%',
                                    }"
                                ></div>
                            </div>
                            <div class="mt-1 flex justify-between">
                                <span class="text-xs text-gray-400 dark:text-zinc-300">
                                    {{ formatTime(isSeeking ? seekTime : currentTime) }}
                                </span>
                                <span class="text-xs text-gray-400 dark:text-zinc-300">
                                    {{ formatTime(duration) }}
                                </span>
                            </div>
                        </div>

                        <!-- Error Display -->
                        <div
                            v-if="audioError"
                            class="mx-6 my-2 rounded-md bg-red-50 p-3 dark:bg-red-900/20"
                        >
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-2">
                                    <ExclamationTriangleIcon class="h-5 w-5 text-red-500" />
                                    <span class="text-sm text-red-700 dark:text-red-300">{{
                                        audioError
                                    }}</span>
                                </div>
                                <button
                                    v-if="retryCount < maxRetries && canRetry"
                                    @click="retryAudio"
                                    class="flex items-center space-x-1 rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200 dark:bg-red-800 dark:text-red-300 dark:hover:bg-red-700"
                                >
                                    <ArrowPathIcon class="h-3 w-3" />
                                    <span>Retry ({{ maxRetries - retryCount }} left)</span>
                                </button>
                            </div>
                        </div>

                        <!-- Loading Indicator -->
                        <div v-if="isLoading" class="mx-6 my-2 flex items-center justify-center">
                            <div class="flex items-center space-x-2">
                                <div
                                    class="h-4 w-4 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent"
                                ></div>
                                <span class="text-sm text-zinc-600 dark:text-zinc-400"
                                    >Loading audio...</span
                                >
                            </div>
                        </div>

                        <!-- Connection Warning -->
                        <div
                            v-if="connectionError && !audioError"
                            class="mx-6 my-2 rounded-md bg-orange-50 p-2 dark:bg-orange-900/20"
                        >
                            <div class="flex items-center space-x-2">
                                <ExclamationTriangleIcon class="h-4 w-4 text-orange-500" />
                                <span class="text-xs text-orange-700 dark:text-orange-300">
                                    Slow connection detected. Audio may buffer frequently.
                                </span>
                            </div>
                        </div>

                        <!-- Controls -->
                        <div class="my-1">
                            <!-- Main playback controls -->
                            <div
                                class="flex items-center justify-center space-x-4 text-black dark:text-white"
                            >
                                <button
                                    class="flex items-center space-x-0"
                                    @click="skip(-10)"
                                    title="Skip back 10s (J or ←)"
                                    aria-label="Skip backward 10 seconds"
                                >
                                    <ChevronDoubleLeftIcon
                                        class="h-5 w-5 text-zinc-500 dark:text-slate-400"
                                    />
                                    <span
                                        class="rounded-2xl bg-zinc-500 px-1 py-0.5 text-sm text-white dark:bg-slate-400 dark:text-black"
                                        >10</span
                                    >
                                </button>

                                <button
                                    @click="togglePlay"
                                    class="rounded-full p-3"
                                    :disabled="isLoading"
                                    :title="isPlaying ? 'Pause (Space or K)' : 'Play (Space or K)'"
                                    :aria-label="isPlaying ? 'Pause audio' : 'Play audio'"
                                >
                                    <div
                                        v-if="isLoading"
                                        class="h-6 w-6 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent"
                                        aria-hidden="true"
                                    ></div>
                                    <PlayIcon
                                        v-else-if="!isPlaying"
                                        class="h-12 w-12 text-zinc-500 dark:text-slate-400"
                                        aria-hidden="true"
                                    />
                                    <PauseIcon
                                        v-else
                                        class="h-12 w-12 text-zinc-500 dark:text-slate-400"
                                        aria-hidden="true"
                                    />
                                </button>

                                <button
                                    class="flex items-center space-x-0"
                                    @click="skip(10)"
                                    title="Skip forward 10s (L or →)"
                                    aria-label="Skip forward 10 seconds"
                                >
                                    <span
                                        class="rounded-3xl bg-zinc-500 px-1 py-0.5 text-sm text-white dark:bg-slate-400 dark:text-black"
                                        >10</span
                                    >
                                    <ChevronDoubleRightIcon
                                        class="h-5 w-5 text-zinc-500 dark:text-slate-400"
                                    />
                                </button>
                            </div>

                            <!-- Secondary controls -->
                            <div class="mt-2 flex items-center justify-center space-x-6 text-xs">
                                <!-- Volume control -->
                                <div
                                    class="volume-control-container relative flex items-center space-x-2"
                                >
                                    <!-- Volume toggle button -->
                                    <button
                                        @click="toggleVolumeSlider"
                                        class="flex items-center space-x-1 rounded px-2 py-1 hover:bg-black/10 dark:hover:bg-white/10"
                                        :title="isMuted ? 'Unmute (M)' : 'Mute (M)'"
                                        aria-label="Toggle volume controls"
                                    >
                                        <SpeakerXMarkIcon
                                            v-if="isMuted"
                                            class="h-4 w-4 text-zinc-500"
                                        />
                                        <SpeakerWaveIcon v-else class="h-4 w-4 text-zinc-500" />
                                        <span class="text-zinc-600 dark:text-zinc-400">
                                            {{
                                                Math.round(
                                                    (isVolumeSliding ? volumeSlideValue : volume) *
                                                        100,
                                                )
                                            }}%
                                        </span>
                                    </button>

                                    <!-- Volume slider (expanded controls) -->
                                    <div
                                        v-if="showVolumeSlider"
                                        class="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 transform items-center space-x-2 rounded-lg bg-white p-2 shadow-lg dark:bg-slate-700"
                                    >
                                        <!-- Volume down button -->
                                        <button
                                            @click="changeVolume(-0.1)"
                                            class="rounded p-1 hover:bg-gray-100 dark:hover:bg-slate-600"
                                            title="Volume down"
                                            aria-label="Decrease volume"
                                        >
                                            <MinusIcon class="h-3 w-3 text-zinc-500" />
                                        </button>

                                        <!-- Volume slider -->
                                        <div
                                            class="relative h-2 w-20 cursor-pointer rounded-full bg-zinc-300 dark:bg-slate-600"
                                            @mousedown="startVolumeSliding"
                                            @touchstart="startVolumeSliding"
                                        >
                                            <div
                                                class="h-full rounded-full bg-yellow-500 transition-all duration-75"
                                                :style="{
                                                    width:
                                                        (isVolumeSliding
                                                            ? volumeSlideValue
                                                            : volume) *
                                                            100 +
                                                        '%',
                                                }"
                                            ></div>
                                        </div>

                                        <!-- Volume up button -->
                                        <button
                                            @click="changeVolume(0.1)"
                                            class="rounded p-1 hover:bg-gray-100 dark:hover:bg-slate-600"
                                            title="Volume up"
                                            aria-label="Increase volume"
                                        >
                                            <PlusIcon class="h-3 w-3 text-zinc-500" />
                                        </button>

                                        <!-- Mute toggle -->
                                        <button
                                            @click="toggleMute"
                                            class="rounded p-1 hover:bg-gray-100 dark:hover:bg-slate-600"
                                            :title="isMuted ? 'Unmute' : 'Mute'"
                                            aria-label="Toggle mute"
                                        >
                                            <SpeakerXMarkIcon
                                                v-if="isMuted"
                                                class="h-3 w-3 text-red-500"
                                            />
                                            <SpeakerWaveIcon v-else class="h-3 w-3 text-zinc-500" />
                                        </button>
                                    </div>
                                </div>

                                <!-- Playback speed -->
                                <div class="flex items-center space-x-1">
                                    <span class="text-zinc-600 dark:text-zinc-400">Speed:</span>
                                    <select
                                        v-model="playbackRate"
                                        @change="changePlaybackSpeed(playbackRate)"
                                        class="rounded border-none bg-transparent text-xs text-zinc-600 focus:ring-1 focus:ring-yellow-500 dark:text-zinc-400"
                                        title="Playback speed (1-5 keys)"
                                    >
                                        <option value="0.5">0.5x</option>
                                        <option value="0.75">0.75x</option>
                                        <option value="1">1x</option>
                                        <option value="1.25">1.25x</option>
                                        <option value="1.5">1.5x</option>
                                        <option value="1.75">1.75x</option>
                                        <option value="2">2x</option>
                                    </select>
                                </div>

                                <!-- Help button -->
                                <button
                                    @click="showHelpModal = true"
                                    class="rounded p-1 hover:bg-black/10 dark:hover:bg-white/10"
                                    title="Keyboard shortcuts (?)"
                                    aria-label="Show keyboard shortcuts help"
                                >
                                    <QuestionMarkCircleIcon class="h-4 w-4 text-zinc-500" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </transition>

        <!-- Minimal Player -->
        <div
            v-if="!isExpanded"
            @click="toggleExpand"
            class="flex w-full cursor-pointer items-center justify-between bg-amber-50 p-2 dark:bg-slate-600 lg:w-80 lg:rounded-lg"
        >
            <div class="flex min-w-0 items-center space-x-2">
                <LImage
                    v-if="currentContent.parentImageData"
                    :image="currentContent.parentImageData"
                    :contentParentId="currentContent.parentId"
                    :parentImageBucketId="currentContent.parentImageBucketId"
                    size="smallSquare"
                    aspectRatio="square"
                />

                <div class="flex min-w-0 flex-col">
                    <span class="block min-w-0 truncate text-sm font-semibold">
                        {{ currentContent.title }}
                    </span>
                    <span
                        v-if="currentContent.author || currentContent.summary"
                        class="block min-w-0 truncate text-xs text-zinc-600 dark:text-slate-400"
                    >
                        {{ currentContent.author || currentContent.summary }}
                    </span>
                    <span
                        v-else
                        class="block min-w-0 truncate text-xs text-zinc-400 dark:text-slate-300"
                    >
                        {{
                            currentContent.publishDate
                                ? db
                                      .toDateTime(currentContent.publishDate)
                                      .toLocaleString(DateTime.DATETIME_MED)
                                : ""
                        }}
                    </span>
                </div>
            </div>

            <div class="flex items-center gap-2">
                <!-- Volume control for minimal player -->
                <div class="volume-control-container relative">
                    <button
                        @click.stop="toggleVolumeSlider"
                        class="flex-shrink-0 rounded-full bg-transparent p-1 hover:bg-black/10 dark:hover:bg-white/10"
                        title="Volume controls"
                        aria-label="Toggle volume controls"
                    >
                        <SpeakerXMarkIcon
                            v-if="isMuted"
                            class="h-5 w-5 text-zinc-500 dark:text-slate-400"
                        />
                        <SpeakerWaveIcon v-else class="h-5 w-5 text-zinc-500 dark:text-slate-400" />
                    </button>

                    <!-- Mini volume slider for minimal player -->
                    <div
                        v-if="showVolumeSlider"
                        class="absolute bottom-full right-0 mb-2 flex items-center space-x-2 rounded-lg bg-white p-2 shadow-lg dark:bg-slate-700"
                    >
                        <button
                            @click.stop="changeVolume(-0.1)"
                            class="rounded p-1 hover:bg-gray-100 dark:hover:bg-slate-600"
                            aria-label="Decrease volume"
                        >
                            <MinusIcon class="h-3 w-3 text-zinc-500" />
                        </button>

                        <div
                            class="relative h-2 w-16 cursor-pointer rounded-full bg-zinc-300 dark:bg-slate-600"
                            @mousedown="startVolumeSliding"
                            @touchstart="startVolumeSliding"
                        >
                            <div
                                class="h-full rounded-full bg-yellow-500 transition-all duration-75"
                                :style="{
                                    width:
                                        (isVolumeSliding ? volumeSlideValue : volume) * 100 + '%',
                                }"
                            ></div>
                        </div>

                        <button
                            @click.stop="changeVolume(0.1)"
                            class="rounded p-1 hover:bg-gray-100 dark:hover:bg-slate-600"
                            aria-label="Increase volume"
                        >
                            <PlusIcon class="h-3 w-3 text-zinc-500" />
                        </button>

                        <span class="text-xs text-zinc-600 dark:text-zinc-400">
                            {{ Math.round((isVolumeSliding ? volumeSlideValue : volume) * 100) }}%
                        </span>
                    </div>
                </div>

                <button
                    @click.stop="togglePlay"
                    class="flex-shrink-0 rounded-full bg-transparent p-0"
                >
                    <PlayIcon v-if="!isPlaying" class="h-7 w-7 text-zinc-500 dark:text-slate-400" />
                    <PauseIcon v-else class="h-7 w-7 text-zinc-500 dark:text-slate-400" />
                </button>
                <button
                    @click.stop="closePlayerWithConfirmation"
                    class="flex-shrink-0 rounded-full bg-transparent p-0 hover:bg-black/10 dark:hover:bg-white/10"
                >
                    <XMarkIcon class="h-6 w-6 text-gray-600 dark:text-zinc-300" />
                </button>
            </div>
        </div>

        <!-- Keyboard Shortcuts Help Modal -->
        <div
            v-if="showHelpModal"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            @click="showHelpModal = false"
        >
            <div
                class="mx-4 max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800"
                @click.stop
            >
                <div class="mb-4 flex items-center justify-between">
                    <h3 class="text-lg font-semibold text-zinc-900 dark:text-white">
                        Keyboard Shortcuts
                    </h3>
                    <button
                        @click="showHelpModal = false"
                        class="rounded p-1 hover:bg-gray-100 dark:hover:bg-slate-700"
                        aria-label="Close help modal"
                    >
                        <XMarkIcon class="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                <div class="space-y-3 text-sm">
                    <div class="space-y-2">
                        <h4 class="font-medium text-zinc-800 dark:text-zinc-200">Playback</h4>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">Play/Pause</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700"
                                    >Space, K</code
                                >
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">Skip ±10s</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700"
                                    >←→, J/L</code
                                >
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">Skip ±30s</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700"
                                    >Ctrl + ←→</code
                                >
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">Skip ±5s</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700"
                                    >Shift + ←→</code
                                >
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">Restart</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700">0</code>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <h4 class="font-medium text-zinc-800 dark:text-zinc-200">Volume</h4>
                        <div class="grid grid-cols-1 gap-2 text-xs">
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">Volume ±10%</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700">↑↓</code>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">Mute/Unmute</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700">M</code>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400"
                                    >Volume Slider (Mobile)</span
                                >
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700"
                                    >Tap Speaker</code
                                >
                            </div>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <h4 class="font-medium text-zinc-800 dark:text-zinc-200">Speed</h4>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">1x Speed</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700">1</code>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">1.25x Speed</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700">2</code>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">1.5x Speed</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700">3</code>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">1.75x Speed</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700">4</code>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">2x Speed</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700">5</code>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <h4 class="font-medium text-zinc-800 dark:text-zinc-200">Other</h4>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">Toggle Size</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700">F</code>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">Retry</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700">R</code>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">Close Player</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700">Esc</code>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-600 dark:text-zinc-400">Show Help</span>
                                <code class="rounded bg-gray-100 px-1 dark:bg-slate-700">?</code>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                    Press any key or click outside to close
                </div>
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
