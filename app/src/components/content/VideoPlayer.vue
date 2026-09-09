<script setup lang="ts">
/**
 * Video playback for a content document.
 *
 * The player itself is `LuminaryPlayer` from the encoder's `player-web-legacy`
 * package. What lives here is what is Luminary's rather than the player's: which
 * URL to play, where the decryption key comes from, resume position, and the
 * engagement signals a finished video sends.
 */
import { computed, nextTick, ref, watch } from "vue";
import { LuminaryPlayer, type PlayerSource } from "@luminary-media-converter/player-web-legacy";
import { type ContentDto, fetchHlsKey } from "luminary-shared";
import LImage from "../images/LImage.vue";
import { appLanguagesPreferredAsRef, queryParams } from "@/globalConfig";
import { getMediaProgress, removeMediaProgress, setMediaProgress } from "@/contentProgress";
import { recordAffinity } from "@/recommendation/affinityStore";
import { affinityConfig } from "@/recommendation/defaultAffinityStore";
import { markSeen } from "@/recommendation/seenStore";
import { resolveVideoSource, videoSourceFor } from "@/util/videoSource";
import { useBucketInfo } from "@/composables/useBucketInfo";
import { createMediaWatchTracker } from "@/recommendation/mediaWatchTracker";

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

/**
 * What the progress store calls this video. The stored URL rather than the resolved
 * one, because ContentTile knows only the stored form, and a bucket re-pointed or
 * renamed must not lose the viewer's position.
 */
const mediaId = computed(() => videoSourceFor(props.content));

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

/**
 * Whether the key question has been answered for this document. An encrypted
 * stream must not be handed to the player before its key is in hand, or it is
 * loaded, fails, and is loaded again.
 */
const keyResolved = ref(false);

const source = computed<PlayerSource | null>(() => {
    const url = videoSource.value;
    if (!url || !keyResolved.value) return null;
    return { masterUrl: url, keyHex: keyHex.value };
});

watch(
    () => props.content?._id,
    async () => {
        keyHex.value = undefined;
        keyResolved.value = false;
        try {
            const parentId = props.content?.parentId;
            if (parentId && props.content?.parentMedia?.hlsKey_id) {
                keyHex.value = await fetchHlsKey(parentId);
            }
        } catch (error) {
            // A key that cannot be had is the same as no key, as above: the player is
            // given the source and reports its own failure.
            console.error("Could not fetch the HLS decryption key", error);
        } finally {
            // A question that cannot be answered is still answered: leaving this false
            // holds `source` at null, and the viewer gets a poster and no player at all.
            keyResolved.value = true;
        }
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

/**
 * How much of the video was actually played.
 *
 * `ended` alone misses most completions — few people sit through the outro — so a
 * watch that passes the configured fraction counts, and the tracker holds the one
 * completion so ending afterwards cannot count it twice.
 */
const watchTracker = createMediaWatchTracker();

/** Both call sites claim the completion from the tracker before scoring it. */
function applyCompletion() {
    // Finishing a video is a strong engagement signal — weighted above a plain open.
    recordAffinity(props.content.parentTags, affinityConfig.value.eventWeight.completion);

    // mediaProgress is a 10-slot ring buffer used only to resume playback, not a
    // history — record completion in the durable seen store instead.
    markSeen(props.content._id);
}

/** Below this, a position is not worth resuming and is not recorded. */
const MIN_RESUME_SECONDS = 60;
const playerWrapper = ref<HTMLElement | null>(null);

/**
 * Hands the video to Matomo's Media Analytics once it is in the DOM.
 *
 * The scan reads `data-matomo-title` off the `<video>` itself, which is the
 * player's element rather than ours, so the title is set here rather than bound.
 * Watched rather than done once: video.js replaces the element when it swaps
 * techs, and a title the CMS edits while the same video plays has to follow.
 */
watch(
    [source, () => props.content.title],
    async ([current]) => {
        if (!current) return;
        await nextTick();

        // Best effort: the element belongs to the player, and video.js has not always
        // put one in place by now.
        playerWrapper.value
            ?.querySelector("video")
            ?.setAttribute("data-matomo-title", props.content.title);

        // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
        if (window._paq) {
            // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
            window._paq.push(
                ["MediaAnalytics::enableMediaAnalytics"],
                ["MediaAnalytics::scanForMedia", window.document],
            );
        }
    },
    { immediate: true },
);

/** Resuming lands slightly before where the viewer left, to re-establish context. */
const RESUME_REWIND_SECONDS = 30;

function onLoadedMetadata() {
    completed = false;
    watchTracker.reset();
    const id = mediaId.value;
    if (!id) return;

    const progress = getMediaProgress(id, props.content._id);
    if (progress > MIN_RESUME_SECONDS) player.value?.seek(progress - RESUME_REWIND_SECONDS);

    if (autoPlay) void player.value?.play();
    if (autoFullscreen) void player.value?.enterFullscreen();
}

function onTimeUpdate(currentTime: number, duration: number) {
    watchTracker.track(currentTime);
    if (
        watchTracker.claimCompletionIfWatched(duration, affinityConfig.value.mediaCompletionPercent)
    ) {
        // The saved progress deliberately stays put — there is still a tail to resume.
        applyCompletion();
    }

    const id = mediaId.value;
    if (!id || duration === Infinity || currentTime < MIN_RESUME_SECONDS) return;

    // A fallback for an `ended` that never arrives, which is the normal case on
    // YouTube. One second short of the duration is as close as a `timeupdate`
    // reliably gets.
    if (duration > 0 && currentTime >= duration - 1) {
        if (!completed) onEnded();
        return;
    }

    setMediaProgress(id, props.content._id, currentTime, duration);
}

function onEnded() {
    const id = mediaId.value;
    if (!id || completed) return;
    completed = true;

    removeMediaProgress(id, props.content._id);

    // Nothing to score if the watched fraction already claimed it.
    if (watchTracker.claimCompletion()) applyCompletion();

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

        <div
            ref="playerWrapper"
            class="video-player absolute bottom-0 left-0 right-0 top-0"
        >
            <LuminaryPlayer
                v-if="source"
                ref="player"
                :source="source"
                :preferred-language="preferredLanguage"
                :controls="controls"
                @loadedmetadata="onLoadedMetadata"
                @timeupdate="onTimeUpdate"
                @ended="onEnded"
            />
        </div>
    </div>
</template>
