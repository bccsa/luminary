<script setup lang="ts">
import { onMounted, computed, watch } from "vue";
import { type MediaDto } from "luminary-shared";
import { FilmIcon, ArrowTopRightOnSquareIcon } from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import { useMediaEncoder } from "@/composables/useMediaEncoder";
import { ENCODER_PROTOCOL_URL } from "@/util/mediaEncoder";
import { storageSelection } from "@/composables/storageSelection";

type Props = {
    documentId?: string;
    mediaBucketId?: string;
    title?: string;
    disabled?: boolean;
};
const props = defineProps<Props>();

const emit = defineEmits<{
    mediaReady: [media: Pick<MediaDto, "hlsUrl" | "hlsKey">];
    bucketSelected: [bucketId: string];
}>();

const bucketSelection = storageSelection();

// The bucket to encode into, on the same rule the media editor uses: a lone media
// bucket counts as selected even though nothing has written it to the document yet.
// Requiring the persisted value would leave the button dead on every post that has
// never had media attached, which is every post this feature is for.
const effectiveBucketId = computed(
    () => props.mediaBucketId ?? bucketSelection.autoSelectMediaBucket.value ?? undefined,
);

const { availability, busy, status, progress, error, refreshAvailability, start, resume } =
    useMediaEncoder();

/**
 * An encode outlives this page, so arriving at a document asks whether one is
 * already running for it rather than assuming the encoder is idle.
 */
const checkAndResume = async () => {
    await refreshAvailability();
    if (!props.documentId) return;

    await resume({
        documentId: props.documentId,
        onMediaReady: (media) => emit("mediaReady", media),
    });
};

onMounted(() => void checkAndResume());

// The editor can move between documents without this component being rebuilt, and
// the previous document's encode is not this one's.
watch(
    () => props.documentId,
    () => void checkAndResume(),
);

/** The encoder's session statuses, in the words an editor should see. */
const STATUS_LABELS: Record<string, string> = {
    created: "Preparing",
    uploading: "Reading file",
    uploaded: "Ready",
    queued: "Queued",
    encoding: "Encoding",
    encrypting: "Encrypting",
    uploading_to_s3: "Uploading",
    completed: "Encoded",
    failed: "Failed",
};

/**
 * Status and progress as one string.
 *
 * Built here rather than from two nodes in the template: Vue condenses the
 * whitespace between an interpolation and an element, which renders "Encoded100%".
 *
 * The percentage is only meaningful while something is running — on a finished
 * encode "Encoded 100%" says the same thing twice.
 */
const statusText = computed(() => {
    if (!status.value) return "";

    const label = STATUS_LABELS[status.value] ?? status.value;
    const running = status.value == "encoding" || status.value == "uploading_to_s3";

    return running && progress.value != undefined ? `${label} ${progress.value}%` : label;
});

/**
 * Launching the app takes a moment, and nothing tells this page when it is up —
 * so re-check shortly after the link is followed, which turns the launch link back
 * into an encode button without the editor having to reload.
 */
const recheckAfterLaunch = () => {
    setTimeout(() => void refreshAvailability(), 2000);
};

/**
 * Why the button is unavailable, or empty when it is ready. Surfaced as a tooltip:
 * a control that is disabled for four different reasons and explains none of them
 * is a support question every time.
 */
const disabledReason = computed(() => {
    if (props.disabled) return "You do not have permission to edit this document.";
    if (!props.documentId) return "Save the document before encoding media for it.";
    if (!effectiveBucketId.value) return "No media storage bucket is configured for this document.";
    if (availability.value == "checking") return "Looking for Luminary Media Convert…";
    if (availability.value != "available") return "Luminary Media Convert is not running.";
    if (busy.value) return "Starting an encoding session…";
    return "";
});

const encode = () => {
    const bucketId = effectiveBucketId.value;
    if (!props.documentId || !bucketId) return;

    // Starting an encode is the user choosing this bucket, so the document records
    // it — the collection has to be findable later, and an auto-selected bucket that
    // was never written down stops being the answer the moment a second one exists.
    if (bucketId != props.mediaBucketId) emit("bucketSelected", bucketId);

    void start({
        documentId: props.documentId,
        title: props.title || "Untitled",
        mediaBucketId: bucketId,
        onMediaReady: (media) => emit("mediaReady", media),
    });
};
</script>

<template>
    <div class="flex items-center gap-2">
        <!--
            The encoder is a separate desktop application. When it is not running there
            is nothing to click, so the button becomes a launch link instead of a
            disabled control that explains nothing.
        -->
        <!--
            Only Chromium implements the loopback grant this depends on, so
            elsewhere the launch link cannot work however many times it is clicked.
        -->
        <span
            v-if="availability == 'browser-unsupported'"
            class="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400"
            title="Luminary Media Convert can only be reached from Chrome. Open this page in Chrome to encode video."
            data-test="encoder-browser-unsupported"
        >
            <FilmIcon class="h-5 w-5" />
            <span class="hidden text-sm sm:inline">Encoding needs Chrome</span>
        </span>

        <a
            v-else-if="availability == 'unavailable'"
            :href="ENCODER_PROTOCOL_URL"
            class="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-800"
            title="Luminary Media Convert is not running. Open it, then try again."
            data-test="encoder-launch"
            @click="recheckAfterLaunch"
        >
            <ArrowTopRightOnSquareIcon class="h-5 w-5" />
            <span class="hidden text-sm sm:inline">Open encoder</span>
        </a>

        <LButton
            v-else
            :icon="FilmIcon"
            size="base"
            :disabled="Boolean(disabledReason)"
            :title="disabledReason || 'Encode video with Luminary Media Convert'"
            @click.stop="encode"
            data-test="encode-media-button"
        >
            <span class="block sm:hidden">Encode video</span>
            <span class="hidden text-sm sm:inline">Encode</span>
        </LButton>

        <span
            v-if="statusText"
            class="whitespace-nowrap text-xs text-zinc-500"
            data-test="encoder-status"
        >
            {{ statusText }}
        </span>
        <span
            v-if="error"
            class="truncate text-xs text-red-600"
            :title="error"
            data-test="encoder-error"
        >
            {{ error }}
        </span>
    </div>
</template>
