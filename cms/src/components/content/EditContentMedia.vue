<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { type ContentParentDto, type MediaDto } from "luminary-shared";
import { FilmIcon, QuestionMarkCircleIcon } from "@heroicons/vue/24/outline";
import LCard from "../common/LCard.vue";
import EncodeMediaButton from "../media/EncodeMediaButton.vue";
import EncodeStatus from "../media/EncodeStatus.vue";
import MediaBucketSelect from "../media/MediaBucketSelect.vue";
import MediaAudioList from "../media/MediaAudioList.vue";
import EditContentVideo from "./EditContentVideo.vue";
import { useMediaEncoder } from "@/composables/useMediaEncoder";
import { ENCODER_DOWNLOAD_URL } from "@/util/mediaEncoder";
import { storageSelection } from "@/composables/storageSelection";

/**
 * Everything about this document's media, in the order the job is done: where it
 * goes, how it gets there, what arrived, and what was already here.
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

    parent.value.media = {
        ...(parent.value.media ?? { fileCollections: [] }),
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
    <LCard v-if="parent" bare title="Media" :icon="FilmIcon" data-test="media-section">
        <template #actions>
            <EncodeMediaButton
                :availability="availability"
                :busy="busy"
                :documentId="parent._id"
                :hasBucket="Boolean(effectiveBucketId)"
                :disabled="disabled"
                @encode="encode"
            />
            <button
                class="flex cursor-pointer items-center gap-1 rounded-md"
                type="button"
                aria-label="Media help"
                @click.stop="showHelp = !showHelp"
            >
                <QuestionMarkCircleIcon class="h-5 w-5" />
            </button>
        </template>

        <div class="flex flex-col gap-3">
            <p v-if="showHelp" class="text-xs text-zinc-500">
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
                @bucket-selected="handleBucketSelected"
            />

            <EncodeStatus
                :availability="availability"
                :outdated="outdated"
                :status="status"
                :progress="progress"
                :pipelineProgress="pipelineProgress"
                :error="error"
            />

            <EditContentVideo v-if="showVideo" bare :disabled="disabled" v-model:parent="parent" />

            <MediaAudioList :parent="parent" />
        </div>
    </LCard>
</template>
