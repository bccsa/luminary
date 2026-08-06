<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { type ContentParentDto, type MediaDto, toAbsoluteMediaUrl } from "luminary-shared";
import { FilmIcon, QuestionMarkCircleIcon } from "@heroicons/vue/24/outline";
import LCard from "../common/LCard.vue";
import EncodeMediaButton from "../media/EncodeMediaButton.vue";
import EncodeStatus from "../media/EncodeStatus.vue";
import MediaBucketSelect from "../media/MediaBucketSelect.vue";
import EditContentVideo from "./EditContentVideo.vue";
import { useMediaEncoder } from "@/composables/useMediaEncoder";
import { ENCODER_DOWNLOAD_URL } from "@/util/mediaEncoder";
import { storageSelection } from "@/composables/storageSelection";

/**
 * Everything about this document's media, in the order the job is done: where it
 * goes, how it gets there, and what arrived.
 *
 * The encode and its result used to sit in separate cards, so an editor clicked in
 * one and watched the other. They are the same fields on `media`, so they are one
 * section.
 */
type Props = {
    disabled: boolean;
    /** Shown in the encoder's session list so the editor can tell encodes apart. */
    title?: string;
    /** The video fields need a translation selected, as they always have. */
    showVideo?: boolean;
};
const props = defineProps<Props>();

const parent = defineModel<ContentParentDto>("parent");

const showHelp = ref(false);
const bucketSelection = storageSelection();

const {
    availability,
    outdated,
    busy,
    status,
    progress,
    pipelineProgress,
    error,
    refreshAvailability,
    watchForEncoder,
    start,
    resume,
    stop,
} = useMediaEncoder();

const effectiveBucketId = computed(() =>
    bucketSelection.effectiveMediaBucketId(parent.value?.mediaBucketId),
);

/**
 * The encoder publishes its URL when encoding *starts*, so this lands well before
 * the output exists. Written straight onto the document: the editor's normal save
 * persists it, and the app's coming-soon state covers the gap until the first
 * segments are in the bucket.
 */
const handleEncodedMedia = (media: Pick<MediaDto, "hlsUrl" | "hlsKey">, documentId: string) => {
    // The editor may have moved to another document while the encoder was slow to
    // answer; that document must not receive this one's collection.
    if (!parent.value || parent.value._id !== documentId) return;

    // A resumed session offers the URL it started with, absolute, while the API
    // stores it relative to the bucket. Writing it back says the same thing in a
    // different shape: it marks an untouched document edited, and in a save that
    // also changes the bucket the API reads the pair as a hand edit and moves no
    // files.
    const bucket = bucketSelection.getBucketById(effectiveBucketId.value ?? null);
    if (toAbsoluteMediaUrl(parent.value.media?.hlsUrl, bucket?.publicUrl) === media.hlsUrl) return;

    parent.value.media = {
        ...parent.value.media,
        hlsUrl: media.hlsUrl,
        hlsKey: media.hlsKey,
    };
};

/** Records the bucket the encode was sent to, when it was auto-selected rather than picked. */
const handleBucketSelected = (bucketId: string) => {
    if (parent.value) parent.value.mediaBucketId = bucketId;
};

const encode = () => {
    const bucketId = effectiveBucketId.value;
    if (!parent.value?._id || !bucketId) return;

    // Starting an encode is the user choosing this bucket, so the document records
    // it — the collection has to be findable later, and an auto-selected bucket that
    // was never written down stops being the answer the moment a second one exists.
    if (bucketId != parent.value.mediaBucketId) handleBucketSelected(bucketId);

    void start({
        documentId: parent.value._id,
        title: props.title || "Untitled",
        mediaBucketId: bucketId,
        onMediaReady: handleEncodedMedia,
    });
};

/**
 * An encode outlives this page, so arriving at a document asks whether one is
 * already running for it rather than assuming the encoder is idle.
 */
const checkAndResume = async () => {
    // Nothing tells this page that the desktop app has started or stopped, so it
    // is asked for as long as this section is on screen — not only while it is
    // missing. An editor who quits the encoder mid-edit should not be left with
    // a button that still looks usable.
    await refreshAvailability();
    watchForEncoder();
    if (!parent.value?._id) return;

    await resume({ documentId: parent.value._id, onMediaReady: handleEncodedMedia });
};

onMounted(() => void checkAndResume());

// The editor can move between documents without this component being rebuilt, and
// the previous document's encode is not this one's.
watch(
    () => parent.value?._id,
    () => {
        stop();
        void checkAndResume();
    },
);
</script>

<template>
    <div v-if="parent">
        <LCard
            v-if="!props.embedded"
            title="Media"
            :icon="FilmIcon"
            :collapsed="newDocument ? false : true"
            collapsible
            class="bg-white dark:bg-slate-800"
        >
            <template #actions>
                <div>
                    <LButton
                        :icon="ArrowUpOnSquareIcon"
                        size="base"
                        :disabled="disabled"
                        @click.stop="triggerFilePicker"
                        data-test="upload-button"
                    >
                        <span class="block sm:hidden">Upload Audio</span>
                        <span class="hidden text-sm sm:inline">Upload</span>
                    </LButton>

        <div class="flex flex-col gap-3">
            <p v-if="showHelp" class="text-xs text-zinc-500 dark:text-zinc-400">
                Video and audio are produced by Luminary Media Convert. Use Encode to open it, pick
                a file, and the encoded playlist is saved back to this document. You need the app on
                your own machine —
                <a
                    :href="ENCODER_DOWNLOAD_URL"
                    target="_blank"
                    rel="noopener"
                    class="font-medium underline underline-offset-2 hover:text-zinc-700"
                    data-test="media-help-download"
                    >download it here</a
                >.
            </p>

            <MediaBucketSelect
                :disabled="disabled"
                v-model:parent="parent"
                class="scrollbar-hide"
            />
        </LCard>

        <div v-else>
            <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                    <FilmIcon class="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
                    <h3 class="text-sm font-medium leading-6 text-zinc-900 dark:text-yellow-400">
                        Media
                    </h3>
                </div>
                <div class="flex items-center gap-2">
                    <LButton
                        :icon="ArrowUpOnSquareIcon"
                        size="base"
                        :disabled="disabled"
                        @click.stop="triggerFilePicker"
                        data-test="upload-button"
                    >
                        <span class="block sm:hidden">Upload Audio</span>
                        <span class="hidden text-sm sm:inline">Upload</span>
                    </LButton>
                    <button
                        class="flex cursor-pointer items-center gap-1 rounded-md text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                        @click.stop="showHelp = !showHelp"
                        aria-label="Media help"
                        type="button"
                    >
                        <QuestionMarkCircleIcon class="h-5 w-5" />
                    </button>
                </div>
            </div>

            <input
                ref="uploadInput"
                type="file"
                class="hidden"
                accept="audio/aac, audio/mp3, audio/opus, audio/wav, audio/x-wav"
                @change="handleFileChange"
            />

            <div v-if="showHelp" class="mt-2 text-zinc-600 dark:text-zinc-400">
                <p class="mb-2 text-xs">
                    You can upload multiple audio files, one per language. Each language can have
                    only one audio file. Uploading a new file for a language that already has audio
                    will replace the existing file.
                </p>
                <p class="mb-2 text-xs">
                    Supported formats: MP3, AAC, Opus, WAV.
                    <br />Maximum file size: {{ maxMediaUploadFileSizeMb }}MB.
                </p>
            </div>

            <EditContentVideo v-if="showVideo" bare :disabled="disabled" v-model:parent="parent" />
        </div>
    </LCard>
</template>
