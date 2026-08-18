<script setup lang="ts">
/**
 * Video playback for a content document.
 *
 * The player itself is `LuminaryPlayer` from the encoder's `player-web-legacy`
 * package — the same Video.js 8 chrome this component used to build by hand,
 * now maintained next to the encoder that produces the streams. What lives here
 * is everything that is Luminary's rather than the player's: which URL to play,
 * where the decryption key comes from, resume position, and the engagement
 * signals a finished video sends.
 *
 * The player owns, and this file no longer does: control-bar layout, auto-hiding
 * controls, the iOS keep-alive audio element, rotation/fullscreen handling,
 * audio-track selection by preferred language, the stall nudge, audio-only mode,
 * and the whole YouTube branch.
 */
import { computed, ref, watch } from "vue";
import { LuminaryPlayer, type PlayerSource } from "@luminary-media-converter/player-web-legacy";
import { type ContentDto } from "luminary-shared";
import { getRest } from "luminary-shared";
import LImage from "../images/LImage.vue";
import { appLanguagesPreferredAsRef, queryParams } from "@/globalConfig";
import { getMediaProgress, removeMediaProgress, setMediaProgress } from "@/contentProgress";
import { recordAffinity } from "@/recommendation/affinityStore";
import { affinityConfig } from "@/recommendation/defaultAffinityStore";
import { markSeen } from "@/recommendation/seenStore";
import { resolveVideoSource } from "@/util/videoSource";
import { useBucketInfo } from "@/composables/useBucketInfo";

type Props = {
    content: ContentDto;
    language: string | null | undefined;
};

const props = defineProps<Props>();

const player = ref<InstanceType<typeof LuminaryPlayer> | null>(null);

// The media bucket, so a stored relative URL can be resolved to a fetchable
// one — see resolveVideoSource.
const mediaBucketIdRef = computed(() => props.content?.parentMediaBucketId);
const { bucketBaseUrl: mediaBucketBaseUrl } = useBucketInfo(mediaBucketIdRef);

const videoSource = computed(() => resolveVideoSource(props.content, mediaBucketBaseUrl.value));

const autoPlay = queryParams.get("autoplay") === "true";
const autoFullscreen = queryParams.get("autofullscreen") === "true";

/**
 * The decryption key, once the server has handed it over.
 *
 * Encrypted media is encrypted at rest in the bucket and the document carries
 * only `hlsKey_id`, so the key is fetched rather than read. Absent means
 * "unencrypted, or not ours to have" — both of which are simply a source with no
 * key, so the request failing is not an error path here.
 */
const keyHex = ref<string | undefined>(undefined);

/**
 * The language to select among the stream's audio tracks.
 *
 * The prop wins when the caller sets one; otherwise the viewer's first preferred
 * app language. The player matches leniently — two- and three-letter codes, both
 * ISO-639-2 sets — because browsers disagree about how they spell a track's
 * language.
 */
const preferredLanguage = computed(
    () => props.language || appLanguagesPreferredAsRef.value[0]?.languageCode || undefined,
);

/**
 * Which of the player's own controls this app offers.
 *
 * The subtitles menu is off because the app's control bar has never had one, and
 * Luminary ships no sidecar subtitles: video.js would hide the button today
 * anyway, but the first stream carrying a caption track would otherwise put a
 * new control in front of every viewer without anyone deciding to.
 */
const controls = { subtitlesMenu: false };

const source = computed<PlayerSource | null>(() => {
    const url = videoSource.value;
    if (!url) return null;
    return { masterUrl: url, keyHex: keyHex.value };
});

/**
 * Fetches the key for whatever document is being played.
 *
 * Runs before the source is built, so an encrypted stream is loaded once with
 * its key rather than loaded, failed, and reloaded. A document with no key
 * answers 404 and leaves `keyHex` undefined, which is the unencrypted case and
 * needs no special handling.
 */
watch(
    () => props.content?._id,
    async (id) => {
        keyHex.value = undefined;
        if (!id || !props.content?.parentMedia?.hlsKey_id) return;
        keyHex.value = (await getRest().getMediaKey(id))?.keyHex;
    },
    { immediate: true },
);

// --- resume position ------------------------------------------------------

/**
 * Whether the end-of-video cleanup has already run for this playthrough.
 *
 * YouTube's tech is known to drop `ended`, so completion is also detected from
 * the position; without this the near-end detector would fire on every tick of
 * the last second.
 */
let completed = false;

/** Below this, a position is not worth resuming and is not recorded. */
const MIN_RESUME_SECONDS = 60;
/** Resuming lands slightly before where the viewer left, to re-establish context. */
const RESUME_REWIND_SECONDS = 30;

function onLoadedMetadata() {
    completed = false;
    const url = videoSource.value;
    if (!url) return;

    const progress = getMediaProgress(url, props.content._id);
    if (progress > MIN_RESUME_SECONDS) player.value?.seek(progress - RESUME_REWIND_SECONDS);

    if (autoPlay) void player.value?.play();
    if (autoFullscreen) void player.value?.enterFullscreen();
}

function onTimeUpdate(currentTime: number, duration: number) {
    const url = videoSource.value;
    if (!url || duration === Infinity || currentTime < MIN_RESUME_SECONDS) return;

    // A fallback for an `ended` that never arrives, which is the normal case on
    // YouTube. One second short of the duration is as close as a `timeupdate`
    // reliably gets.
    if (duration > 0 && currentTime >= duration - 1) {
        if (!completed) onEnded();
        return;
    }

    setMediaProgress(url, props.content._id, currentTime, duration);
}

function onEnded() {
    const url = videoSource.value;
    if (!url || completed) return;
    completed = true;

    removeMediaProgress(url, props.content._id);

    // Finishing a video is a strong engagement signal — weighted above a plain
    // open. Guarded by `completed` so the near-end fallback and a real `ended`
    // cannot both count it.
    recordAffinity(props.content.parentTags, affinityConfig.value.eventWeight.completion);

    // mediaProgress is a 10-slot ring buffer used only to resume playback, not a
    // history — record completion in the durable seen store instead.
    markSeen(props.content._id);

    player.value?.exitFullscreen();
}
</script>

<template>
    <div class="relative bg-transparent md:rounded-lg">
        <LImage
            :image="content.parentImageData"
            aspectRatio="video"
            size="post"
            :content-parent-id="content.parentId"
            :parent-image-bucket-id="content.parentImageBucketId"
        />

        <div class="video-player absolute bottom-0 left-0 right-0 top-0">
            <LuminaryPlayer
                v-if="source"
                ref="player"
                :source="source"
                :preferred-language="preferredLanguage"
                :controls="controls"
                :data-matomo-title="content.title"
                @loadedmetadata="onLoadedMetadata"
                @timeupdate="onTimeUpdate"
                @ended="onEnded"
            />
        </div>
    </div>
</template>
