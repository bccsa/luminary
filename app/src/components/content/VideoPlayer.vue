<script setup lang="ts">
/**
 * Video playback for a content document.
 *
 * The player itself comes from the build target's video-player service: the
 * encoder's Video.js `LuminaryPlayer` in a browser, the native one in the packaged
 * app. What lives here is what is Luminary's rather than the player's: which URL
 * to play, where the decryption key comes from, resume position, and the
 * engagement signals a finished video sends.
 */
import { computed, inject, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    AUDIO_ONLY_ANGLE_ID,
    isYouTubeUrl,
    LuminaryPlayer,
    type PlayerSource,
} from "@luminary-media-converter/player-web";
import { type ContentDto, fetchHlsKey, reportError } from "luminary-shared";
import LImage from "../images/LImage.vue";
import {
    appLanguagesPreferredAsRef,
    isDataSaverEnabled,
    queryParams,
    userDataSaverEnabled,
} from "@/globalConfig";
import {
    connectionSpeed,
    hasMeasuredConnectionSpeed,
} from "@/composables/useNetworkSpeedEstimator";
import { getMediaProgress, removeMediaProgress, setMediaProgress } from "@/contentProgress";
import { recordAffinity } from "@/recommendation/affinityStore";
import { affinityConfig } from "@/recommendation/defaultAffinityStore";
import { markSeen } from "@/recommendation/seenStore";
import { fallbackArtworkDataUrl } from "@/util/fallbackArtwork";
import { resolveVideoSource, videoSourceFor } from "@/util/videoSource";
import { useBucketInfo } from "@/composables/useBucketInfo";
import { createMediaWatchTracker } from "@/recommendation/mediaWatchTracker";
import { shareImageUrl } from "@/composables/useSocialShare";
import { VideoPlayerKey } from "@/build-time/contracts/video-player/token";
import type {
    VideoNowPlaying,
    VideoPlayerHandle,
} from "@/build-time/contracts/video-player/contract";

type Props = {
    content: ContentDto;
    language: string | null | undefined;
    /** Start with the sound only, fetching no video; read when the content changes. */
    startAudio?: boolean;
    autoplay?: boolean;
    /** Go full-screen when autoplay starts the video, for a player that shows video only there. */
    fullscreenOnPlay?: boolean;
    /** Draw the video in the page where the platform can; see `VideoPlayerHandle.inlineActive`. */
    inline?: boolean;
};

const props = defineProps<Props>();
const { t } = useI18n();

/**
 * The player's own strings, in the language of the app: the web and the native player take the
 * same keys, and each uses the ones it has. The skip texts keep their `{seconds}` for the player
 * to fill in with its own interval.
 */
const playerMessages = computed(() => ({
    comingSoon: t("video_player.coming_soon"),
    errorGeneric: t("video_player.error_generic"),
    errorUnsupportedBrowser: t("video_player.error_unsupported_browser"),
    errorKeyRequired: t("video_player.error_key_required"),
    errorNetwork: t("video_player.error_network"),
    errorMedia: t("video_player.error_media"),
    retry: t("video_player.retry"),
    play: t("media_player.play"),
    pause: t("media_player.pause"),
    scrubberLabel: t("media_player.seek"),
    elapsedLabel: t("video_player.elapsed"),
    durationLabel: t("video_player.duration"),
    skipBack: t("media_player.skip_back", { seconds: "{seconds}" }),
    skipForward: t("media_player.skip_forward", { seconds: "{seconds}" }),
    exitFullscreen: t("video_player.exit_fullscreen"),
    audioMenuLabel: t("video_player.audio_menu"),
    subtitlesMenuLabel: t("video_player.subtitles_menu"),
    subtitlesOff: t("video_player.subtitles_off"),
    videoModeLabel: t("video_player.video_mode"),
    audioModeLabel: t("video_player.audio_mode"),
    // Native full-screen draws its own controls and says these.
    pictureInPicture: t("media_player.picture_in_picture"),
    playbackRate: t("media_player.speed"),
    mute: t("media_player.mute"),
    unmute: t("media_player.unmute"),
    loading: t("video_player.loading"),
}));

// The browser's player when no service is provided: a component mounted on its own.
const videoPlayer = inject(VideoPlayerKey, { component: LuminaryPlayer, acceptsNowPlaying: false });
const player = ref<VideoPlayerHandle | null>(null);

// The media bucket, so a stored relative URL can be resolved to a fetchable
// one — see resolveVideoSource.
const mediaBucketIdRef = computed(() => props.content?.parentMediaBucketId);
const { bucketBaseUrl: mediaBucketBaseUrl } = useBucketInfo(mediaBucketIdRef);

const videoSource = computed(() => resolveVideoSource(props.content, mediaBucketBaseUrl.value));

const imageBucketIdRef = computed(() => props.content?.parentImageBucketId);
const { bucketBaseUrl: imageBucketBaseUrl } = useBucketInfo(imageBucketIdRef);

/**
 * The picture the page shows for this post when its own image does not load, for the lock screen
 * to show too. Made before the source is handed over, so the first load carries it.
 */
const fallbackArtworkUrl = ref<string | undefined>(undefined);

/**
 * What the lock screen shows, for a player that shows one: the title, and the
 * post's image, the one a share of it would carry.
 */
const nowPlaying = computed<VideoNowPlaying>(() => ({
    title: props.content.title,
    artworkUrl: shareImageUrl(props.content, imageBucketBaseUrl.value),
    ...(fallbackArtworkUrl.value ? { fallbackArtworkUrl: fallbackArtworkUrl.value } : {}),
}));
const playerExtras = computed(() => ({
    ...(videoPlayer.acceptsNowPlaying ? { nowPlaying: nowPlaying.value } : {}),
    ...(props.inline && videoPlayer.acceptsInline ? { inline: true } : {}),
}));

/** The video is drawn behind the page here: the poster would only cover it. */
const inlineActive = computed(() => !!props.inline && player.value?.inlineActive === true);

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
 * The media player draws the transport and the audio / video switch itself, so the frame is
 * bare; full-screen still shows the player's controls. A YouTube link keeps the embed's own,
 * having no controller for the media player to drive.
 *
 * The subtitles menu is off because the app's control bar has never had one, and
 * Luminary ships no sidecar subtitles: video.js would hide the button today
 * anyway, but the first stream carrying a caption track would otherwise put a
 * new control in front of every viewer without anyone deciding to.
 */
const controls = computed(() =>
    isYouTubeUrl(videoSource.value)
        ? { subtitlesMenu: false, audioVideoToggle: false }
        : { subtitlesMenu: false, audioVideoToggle: false, windowedControls: false },
);

/** The angle the load starts on, fixed per content so a later change of mind does not reload. */
const startAngleId = ref<string | undefined>(undefined);

/**
 * What Data Saver allows a picture: nothing above this height is offered to the player, so it can
 * be neither chosen by ABR nor picked by hand. Low enough to be cheap, high enough to be watchable.
 */
const DATA_SAVER_MAX_HEIGHT = 360;
/** The cap this content loads with: fixed per content, because a cap only takes effect on a load. */
const maxHeight = ref<number | undefined>(undefined);
/**
 * The measured connection in bits per second, for the player's ABR to start from; absent until a
 * real reading exists. Fixed per content as well: a probe finishing mid-play must not reload it.
 */
const bandwidthEstimate = ref<number | undefined>(undefined);

/**
 * Whether the key question has been answered for this document. An encrypted
 * stream must not be handed to the player before its key is in hand, or it is
 * loaded, fails, and is loaded again.
 */
const keyResolved = ref(false);

const source = computed<PlayerSource | null>(() => {
    const url = videoSource.value;
    if (!url || !keyResolved.value) return null;
    return {
        masterUrl: url,
        keyHex: keyHex.value,
        startAngleId: startAngleId.value,
        maxHeight: maxHeight.value,
        bandwidthEstimate: bandwidthEstimate.value,
    };
});

watch(
    () => props.content?._id,
    async () => {
        keyHex.value = undefined;
        keyResolved.value = false;
        fallbackArtworkUrl.value = undefined;
        const contentId = props.content?._id;
        const artwork = fallbackArtworkDataUrl(props.content?.parentId);
        startAngleId.value = props.startAudio ? AUDIO_ONLY_ANGLE_ID : undefined;
        maxHeight.value =
            userDataSaverEnabled.value || isDataSaverEnabled() ? DATA_SAVER_MAX_HEIGHT : undefined;
        bandwidthEstimate.value = hasMeasuredConnectionSpeed.value
            ? Math.round(connectionSpeed.value * 1_000_000)
            : undefined;
        try {
            const parentId = props.content?.parentId;
            if (parentId && props.content?.parentMedia?.hlsKey_id) {
                keyHex.value = await fetchHlsKey(parentId);
            }
        } catch (error) {
            // A key that cannot be had is the same as no key, as above: the player is
            // given the source and reports its own failure.
            reportError(error, {
                area: "player",
                op: "hls-key",
                data: { contentId: props.content?._id },
            });
        } finally {
            // A question that cannot be answered is still answered: leaving this false
            // holds `source` at null, and the viewer gets a poster and no player at all.
            const made = await artwork;
            // Another post may have taken the player while this one was being made.
            if (props.content?._id === contentId) fallbackArtworkUrl.value = made;
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

    if (autoPlay || props.autoplay) void player.value?.play();
    if (
        autoFullscreen ||
        (props.autoplay && props.fullscreenOnPlay && !props.startAudio && !inlineActive.value)
    ) {
        void player.value?.enterFullscreen();
    }
}

defineExpose({ player, inlineActive });

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
        <div
            v-if="inlineActive"
            class="aspect-video w-full"
        />
        <LImage
            v-else
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
            <component
                :is="videoPlayer.component"
                v-if="source"
                ref="player"
                :source="source"
                :preferred-language="preferredLanguage"
                :controls="controls"
                :messages="playerMessages"
                v-bind="playerExtras"
                @loadedmetadata="onLoadedMetadata"
                @timeupdate="onTimeUpdate"
                @ended="onEnded"
            />
        </div>
    </div>
</template>

<style scoped>
/* A tapped player takes focus, and the full-width layout clips the browser's focus
   ring to a bare line above and below the video. The controls show focus themselves. */
.video-player :deep(.video-js:focus),
.video-player :deep(.vjs-tech:focus) {
    outline: none;
}
</style>
