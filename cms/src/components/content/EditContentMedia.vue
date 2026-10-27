<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
    type ContentParentDto,
    type MediaDto,
    isBucketRelative,
    toAbsoluteMediaUrl,
} from "luminary-shared";
import {
    FilmIcon,
    PencilSquareIcon,
    QuestionMarkCircleIcon,
    TrashIcon,
} from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import LCard from "../common/LCard.vue";
import LDialog from "../common/LDialog.vue";
import EncodeMediaButton from "../media/EncodeMediaButton.vue";
import EncodeStatus from "../media/EncodeStatus.vue";
import MediaBucketSelect from "../media/MediaBucketSelect.vue";
import EditContentVideo from "./EditContentVideo.vue";
import { useMediaEncoder } from "@/composables/useMediaEncoder";
import { isYouTubeUrl } from "@/util/youtubeUtils";
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
    /**
     * Set while the document is unsaved or has unsaved changes; resolves to whether it
     * saved. An encode outlives an editor who leaves without saving, leaving media nothing
     * points to, and starting clean lets the encode's URL be saved on its own.
     */
    saveBeforeEncode?: () => Promise<boolean | undefined>;
    /**
     * Writes the encode's URL onto the document and saves it, so the app shows the
     * video as coming soon while the encode runs instead of waiting for a manual save.
     */
    saveEncodedMedia?: (write: () => void) => Promise<void>;
    /**
     * Takes the video off the document and saves it, once the editor has confirmed here; without
     * it the video only leaves the form, for the editor to save.
     */
    saveDeletedMedia?: (write: () => void) => Promise<void>;
};
const props = defineProps<Props>();

const parent = defineModel<ContentParentDto>("parent");

const showHelp = ref(false);
const showSaveFirstModal = ref(false);
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
    edit,
    resume,
    stop,
} = useMediaEncoder();

const effectiveBucketId = computed(() =>
    bucketSelection.effectiveMediaBucketId(parent.value?.mediaBucketId),
);

/**
 * The encoder publishes its URL when encoding *starts*, so this lands well before
 * the output exists. Saved straight away where the editor allows it, so the app's
 * coming-soon state covers the gap until the output is in the bucket.
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

    const write = () => {
        if (!parent.value) return;
        parent.value.media = {
            ...parent.value.media,
            hlsUrl: media.hlsUrl,
            hlsKey: media.hlsKey,
        };
    };
    if (props.saveEncodedMedia) void props.saveEncodedMedia(write);
    else write();
};

/** Records the bucket the encode was sent to, when it was auto-selected rather than picked. */
const handleBucketSelected = (bucketId: string) => {
    if (parent.value) parent.value.mediaBucketId = bucketId;
};

const encode = () => {
    if (props.saveBeforeEncode) showSaveFirstModal.value = true;
    else startEncode();
};

const saveAndEncode = async () => {
    showSaveFirstModal.value = false;
    if (await props.saveBeforeEncode?.()) startEncode();
};

const startEncode = () => {
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

/** The video this document already has, absolute, as the encoder reaches it. */
const existingVideoUrl = computed(() => {
    const bucket = bucketSelection.getBucketById(effectiveBucketId.value ?? null);
    return toAbsoluteMediaUrl(parent.value?.media?.hlsUrl, bucket?.publicUrl);
});

/** Why the existing video cannot be opened for editing, or empty when it can. */
const editDisabledReason = computed(() => {
    if (props.disabled) return "You do not have permission to edit this document.";
    if (availability.value != "available") return "Luminary Media Convert is not running.";
    if (busy.value) return "Opening Luminary Media Convert…";
    return "";
});

/** Opens the existing video in the encoder, to change its chapters and audio tracks. */
const editVideo = () => {
    const bucketId = effectiveBucketId.value;
    if (!parent.value?._id || !bucketId || !existingVideoUrl.value) return;
    void edit({
        documentId: parent.value._id,
        title: props.title || "Untitled",
        mediaBucketId: bucketId,
        hlsUrl: existingVideoUrl.value,
    });
};

const showDeleteVideoModal = ref(false);

/** Files of ours to delete: a video hosted elsewhere (YouTube) only leaves the document. */
const videoInOurStorage = computed(() => {
    const url = parent.value?.media?.hlsUrl;
    if (!url) return false;
    if (isBucketRelative(url)) return true;
    const bucketRoot = toAbsoluteMediaUrl(
        "/",
        bucketSelection.getBucketById(effectiveBucketId.value ?? null)?.publicUrl,
    );
    return !!bucketRoot && url.startsWith(bucketRoot);
});

/** What the dialog says: files deleted for ours, only the link removed for a video hosted elsewhere. */
const deleteWording = computed(() => {
    if (videoInOurStorage.value) {
        return {
            title: "Delete the video?",
            description:
                "This removes the video from this document and deletes its files from storage, unless another document still uses them. This cannot be undone.",
            button: "Delete video",
        };
    }
    const where = isYouTubeUrl(parent.value?.media?.hlsUrl ?? "")
        ? "on YouTube"
        : "where it is hosted";
    return {
        title: "Remove the video?",
        description: `This removes the video from this document. The video itself stays ${where}: nothing is deleted.`,
        button: "Remove video",
    };
});

/** Asked here, where the editor pressed Delete, rather than later on Save. */
const deleteVideo = () => {
    showDeleteVideoModal.value = true;
};

const confirmDeleteVideo = async () => {
    showDeleteVideoModal.value = false;
    const write = () => {
        if (parent.value) delete parent.value.media;
    };
    if (props.saveDeletedMedia) await props.saveDeletedMedia(write);
    else write();
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
            <!-- One even row under the title: the header has room for the title alone. -->
            <div class="flex gap-2 [&>*]:flex-1 [&>*]:justify-center" data-test="media-toolbar">
                <EncodeMediaButton
                    :availability="availability"
                    :busy="busy"
                    :documentId="parent._id"
                    :hasBucket="Boolean(effectiveBucketId)"
                    :disabled="disabled"
                    @encode="encode"
                />
                <LButton
                    v-if="existingVideoUrl && effectiveBucketId"
                    :icon="PencilSquareIcon"
                    variant="secondary"
                    size="sm"
                    :disabled="Boolean(editDisabledReason)"
                    :title="
                        editDisabledReason || 'Edit the chapters and audio tracks of this video'
                    "
                    data-test="edit-media-button"
                    @click.stop="editVideo"
                >
                    <span class="text-xs">Edit</span>
                </LButton>
                <LButton
                    v-if="existingVideoUrl"
                    :icon="TrashIcon"
                    variant="secondary"
                    context="danger"
                    size="sm"
                    :disabled="disabled"
                    title="Remove this video from the document"
                    data-test="delete-media-button"
                    @click.stop="deleteVideo"
                >
                    <span class="text-xs">Delete</span>
                </LButton>
            </div>

            <p v-if="showHelp" class="text-xs dark:text-zinc-200">
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
        </div>
    </LCard>

    <LDialog
        v-model:open="showDeleteVideoModal"
        :title="deleteWording.title"
        :description="deleteWording.description"
        :primaryAction="confirmDeleteVideo"
        :secondaryAction="() => (showDeleteVideoModal = false)"
        :primaryButtonText="deleteWording.button"
        secondaryButtonText="Cancel"
        context="danger"
        :showClosingButton="false"
    >
        <p class="mt-3 break-all font-mono text-xs text-zinc-500" data-test="delete-media-url">
            {{ parent?.media?.hlsUrl }}
        </p>
    </LDialog>
    <LDialog
        v-model:open="showSaveFirstModal"
        title="Save before encoding"
        description="The encoded media is attached to this document, so it needs to be saved first."
        primaryButtonText="Save now"
        :primaryAction="saveAndEncode"
        secondaryButtonText="Cancel"
        :secondaryAction="() => (showSaveFirstModal = false)"
    />
</template>
