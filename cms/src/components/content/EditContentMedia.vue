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

const { availability, busy, status, progress, error, refreshAvailability, start, resume } =
    useMediaEncoder();

// The bucket to encode into, on the same rule the bucket selector uses: a lone media
// bucket counts as selected even though nothing has written it to the document yet.
// Requiring the persisted value would leave the button dead on every post that has
// never had media attached, which is every post this feature is for.
const effectiveBucketId = computed(
    () => parent.value?.mediaBucketId ?? bucketSelection.autoSelectMediaBucket.value ?? undefined,
);

/**
 * The encoder publishes its URL when encoding *starts*, so this lands well before
 * the output exists. Written straight onto the document: the editor's normal save
 * persists it, and the app's coming-soon state covers the gap until the first
 * segments are in the bucket.
 */
const handleEncodedMedia = (media: Pick<MediaDto, "hlsUrl" | "hlsKey">) => {
    if (!parent.value) return;

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
    await refreshAvailability();
    if (!parent.value?._id) return;

    await resume({ documentId: parent.value._id, onMediaReady: handleEncodedMedia });
};

onMounted(() => void checkAndResume());

// The editor can move between documents without this component being rebuilt, and
// the previous document's encode is not this one's.
watch(
    () => parent.value?._id,
    () => void checkAndResume(),
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
                a file, and the encoded playlist is saved back to this document.
            </p>

            <MediaBucketSelect
                :disabled="disabled"
                v-model:parent="parent"
                @bucket-selected="handleBucketSelected"
            />

            <EncodeStatus
                :availability="availability"
                :status="status"
                :progress="progress"
                :error="error"
                @recheck="refreshAvailability"
            />

            <EditContentVideo v-if="showVideo" bare :disabled="disabled" v-model:parent="parent" />

            <MediaAudioList :parent="parent" />
        </div>
    </LCard>
</template>
