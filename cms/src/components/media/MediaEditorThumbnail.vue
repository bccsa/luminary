<script setup lang="ts">
import { TrashIcon, MusicalNoteIcon, PlayIcon, PauseIcon } from "@heroicons/vue/24/solid";
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import LDialog from "@/components/common/LDialog.vue";
import LBadge from "@/components/common/LBadge.vue";
import type { MediaFileDto, MediaUploadDataDto } from "luminary-shared";

type Props = {
    mediaFile?: MediaFileDto;
    mediaUploadData?: MediaUploadDataDto;
    disabled?: boolean;
    languageCode: string;
};
const props = defineProps<Props>();

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;

// Compute audio source for either existing server file (mediaFile) or new upload (mediaUploadData)
const audioSrc = computed(() => {
    // Existing uploaded media (MediaFileDto)
    if (props.mediaFile) {
        const url = props.mediaFile.fileUrl || "";
        if (/^https?:\/\//i.test(url)) return url; // absolute
        if (!url) return "";
        return `${baseUrl}/${url}`.replace(/([^:]\/)(\/)+/g, "$1"); // collapse any double slashes (except protocol)
    }

    // Pending upload (MediaUploadDataDto)
    if (props.mediaUploadData) {
        const anyData: any = props.mediaUploadData as any;
        if (anyData.fileUrl) {
            // Defensive: some code paths might already assign a fileUrl
            const url = anyData.fileUrl as string;
            return /^https?:\/\//i.test(url) ? url : `${baseUrl}/${url}`;
        }
        // Create object URL for local file data if available
        if (props.mediaUploadData.fileData) {
            return URL.createObjectURL(new Blob([props.mediaUploadData.fileData]));
        }
    }
    return "";
});

const emit = defineEmits<{
    (e: "deleteFileCollection", imageFileCollection: MediaFileDto): void;
    (e: "deleteUploadData", mediaUploadData: MediaUploadDataDto): void;
}>();

const hover = ref(false); // single hover ref used for both modes
const showModal = ref(false);

const deleteFile = () => {
    if (props.mediaFile) {
        emit("deleteFileCollection", props.mediaFile);
    }

    if (props.mediaUploadData) {
        emit("deleteUploadData", props.mediaUploadData);
    }

    showModal.value = false;
};

const cancelDelete = () => {
    showModal.value = false;
};

const deleteMessage = `Are you sure you want to delete the audio file?`;

const mediaElementError = ref(false);

// Playback handling only for existing uploaded media files (mediaFile scenario)
const isPlaying = ref(false);
const audioEl = ref<HTMLAudioElement | null>(null);

// Global coordination so only one thumbnail plays at a time
const GLOBAL_EVENT = "cms-audio-thumbnail-play";

const play = () => {
    if (!audioEl.value) return;
    // Announce so others stop
    window.dispatchEvent(new CustomEvent(GLOBAL_EVENT, { detail: audioEl.value }));
    audioEl.value
        .play()
        .then(() => {
            isPlaying.value = true;
        })
        .catch(() => {
            // If play fails (e.g., autoplay restrictions), keep state consistent
            isPlaying.value = false;
        });
};

const pause = () => {
    if (!audioEl.value) return;
    audioEl.value.pause();

    // reset to start
    audioEl.value.currentTime = 0;

    isPlaying.value = false;
};

const togglePlay = () => {
    if (!props.mediaFile && !props.mediaUploadData) return; // Only for existing media files or uploads
    if (!audioSrc.value) return;
    if (!audioEl.value) return;
    if (isPlaying.value) pause();
    else play();
};

const onEnded = () => {
    isPlaying.value = false;
};

const onGlobalPlay = (e: Event) => {
    const custom = e as CustomEvent<HTMLAudioElement>;
    if (custom.detail !== audioEl.value) {
        // Another instance started playing → stop this one
        if (isPlaying.value) pause();
    }
};

onMounted(() => {
    window.addEventListener(GLOBAL_EVENT, onGlobalPlay);
});

onBeforeUnmount(() => {
    window.removeEventListener(GLOBAL_EVENT, onGlobalPlay);
    if (audioEl.value) {
        // Revoke any object URL for uploads when component unmounts
        if ((props.mediaUploadData || props.mediaFile) && audioSrc.value.startsWith("blob:")) {
            URL.revokeObjectURL(audioSrc.value);
        }
    }
});
</script>

<style scoped>
/* Specifies the size of the audio container */
audio {
    width: 140px;
    height: 65px;
}

audio::-webkit-media-controls-panel {
    -webkit-justify-content: center;
    height: 25px;
}

/* Removes the timeline */
audio::-webkit-media-controls-timeline {
    display: none !important;
}

/* Removes the time stamp */
audio::-webkit-media-controls-current-time-display {
    display: none;
}
audio::-webkit-media-controls-time-remaining-display {
    display: none;
}

/* Play button css */
audio::-webkit-media-controls-play-button {
    margin-right: 10px;
}
</style>

<template>
    <div :class="$attrs.class">
        <!-- Existing uploaded media (custom hover + click playback UI) -->
        <div
            v-if="mediaFile"
            class="group relative flex h-16 w-16 cursor-pointer items-center justify-center rounded bg-white shadow"
            @mouseover="hover = true"
            @mouseleave="hover = false"
            @click="togglePlay"
        >
            <audio
                ref="audioEl"
                :src="audioSrc"
                preload="none"
                class="hidden"
                @error="mediaElementError = true"
                @ended="onEnded"
            />
            <div class="-mt-4 flex items-center justify-center">
                <PlayIcon
                    v-if="!isPlaying && (hover || !mediaElementError)"
                    class="h-8 w-8 text-gray-600 transition group-hover:scale-110"
                />
                <PauseIcon
                    v-else-if="isPlaying && !mediaElementError"
                    class="h-8 w-8 text-gray-600 transition group-hover:scale-110"
                />
                <MusicalNoteIcon v-else class="h-8 w-8 text-gray-500 opacity-70" />
            </div>
            <!-- Scrim when hovering -->
            <div v-show="hover && !mediaElementError" class="absolute inset-0 rounded"></div>

            <!-- Language Badge  -->
            <LBadge
                v-if="languageCode"
                class="absolute -bottom-0 left-1/2 w-full -translate-x-1/2 transform justify-center font-bold"
                variant="info"
                paddingY="py-0"
                :rounded="false"
                size="sm"
            >
                {{ languageCode }}
            </LBadge>

            <TrashIcon
                class="absolute -right-2 -top-2 h-5 w-5 cursor-pointer text-red-500"
                v-show="hover && disabled"
                title="Delete file version"
                @click.stop="showModal = true"
            />
        </div>

        <!-- Pending upload media (same custom UI as existing media) -->
        <div
            v-else-if="mediaUploadData"
            class="group relative flex h-16 w-16 cursor-pointer items-center justify-center rounded bg-white shadow"
            @mouseover="hover = true"
            @mouseleave="hover = false"
            @click="togglePlay"
        >
            <audio
                ref="audioEl"
                :src="audioSrc"
                preload="none"
                class="hidden"
                @error="mediaElementError = true"
                @ended="onEnded"
            />
            <div class="-mt-4 flex items-center justify-center">
                <PlayIcon
                    v-if="!isPlaying && (hover || !mediaElementError)"
                    class="h-8 w-8 text-gray-600 transition group-hover:scale-110"
                />
                <PauseIcon
                    v-else-if="isPlaying && !mediaElementError"
                    class="h-8 w-8 text-gray-600 transition group-hover:scale-110"
                />
                <MusicalNoteIcon v-else class="h-8 w-8 text-gray-500 opacity-70" />
            </div>
            <!-- Scrim when hovering -->
            <div v-show="hover && !mediaElementError" class="absolute inset-0 rounded"></div>

            <!-- Language Badge  -->
            <LBadge
                v-if="languageCode"
                class="absolute -bottom-0 left-1/2 w-full -translate-x-1/2 transform justify-center font-bold"
                variant="info"
                paddingY="py-0"
                :rounded="false"
                size="sm"
            >
                {{ languageCode }}
            </LBadge>

            <TrashIcon
                class="absolute -right-2 -top-2 h-5 w-5 cursor-pointer text-red-500"
                v-show="hover && disabled"
                title="Delete file version"
                @click.stop="showModal = true"
            />
        </div>
    </div>
    <LDialog
        v-model:open="showModal"
        title="Delete file version"
        :description="deleteMessage"
        :primaryAction="deleteFile"
        primaryButtonText="Delete"
        :secondaryAction="cancelDelete"
        secondaryButtonText="Cancel"
        context="danger"
    />
</template>
