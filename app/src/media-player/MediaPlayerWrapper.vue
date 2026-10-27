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
import {
    computed,
    inject,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    watch,
} from "vue";
import {
    AUDIO_ONLY_ANGLE_ID,
    isYouTubeUrl,
    LuminaryPlayer,
    type PlayerSource,
    type PlayerUpNextItem,
} from "@luminary-media-converter/player-web";
import { type ContentDto, fetchHlsKey, reportError } from "luminary-shared";
import LImage from "@/components/images/LImage.vue";
import { usePlayerMessages } from "@/media-player/usePlayerMessages";
import YouTubeWrapper from "./YouTubeWrapper.vue";
import { isYouTubeLink } from "@/util/youtube";
import {
    appLanguagesPreferredAsRef,
    isDarkTheme,
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
    /** Keep the player from drawing the subtitles on the picture: the host shows them itself, or the page covers it. */
    captionsHidden?: boolean;
    /** Draw the video in the page where the platform can; see `VideoPlayerHandle.inlineActive`. */
    inline?: boolean | "front";
    /** With `inline: "front"`, the platform draws the page's chevron on the picture, which the page cannot draw over. */
    inlineBadge?: boolean;
    /** With `inline: "front"`, the picture's corners, to fit the rounded card the page draws around it. */
    inlineRadius?: number;
    /** Room under the picture for native subtitles, in CSS pixels. */
    captionBand?: number;
    /** Show the player's own controls in the page, for a player that is not driven from elsewhere. */
    windowedControls?: boolean;
    /** Videos to offer in the player's own chapters / up next panel, where the player has one. */
    upNext?: PlayerUpNextItem[];
    /** The videos offered near the end of full-screen; the player raises `nextupselect` with the one chosen. */
    nextUp?: PlayerUpNextItem[];
};

const props = defineProps<Props>();
const emit = defineEmits<{ upnextselect: [id: string]; nextupselect: [id: string] }>();

/**
 * The player's own strings, in the language of the app: the web and the native player take the
 * same keys, and each uses the ones it has. The skip texts keep their `{seconds}` for the player
 * to fill in with its own interval.
 */
const playerMessages = usePlayerMessages();

// The browser's player when no service is provided: a component mounted on its own.
const videoPlayer = inject(VideoPlayerKey, {
    component: LuminaryPlayer,
    acceptsNowPlaying: false,
    acceptsBrowse: true,
    acceptsNextUp: true,
});
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
    ...(props.content.author ? { subtitle: props.content.author } : {}),
    artworkUrl: shareImageUrl(props.content, imageBucketBaseUrl.value),
    ...(fallbackArtworkUrl.value ? { fallbackArtworkUrl: fallbackArtworkUrl.value } : {}),
}));
/**
 * What the browser player's full-screen audio screen names: the title, who it is by, and the cover.
 * The native player draws its own, from `nowPlaying` above.
 */
const webNowPlaying = computed(() => ({
    title: props.content.title,
    ...(props.content.author ? { subtitle: props.content.author } : {}),
    ...(shareImageUrl(props.content, imageBucketBaseUrl.value)
        ? { artwork: shareImageUrl(props.content, imageBucketBaseUrl.value) }
        : {}),
}));
/**
 * What the player's controller is given, read once when the player is built: Data Saver turns the
 * background warming of the next chunk off, since a warm is an extra request nobody asked for.
 * Taken when this component is created: a player swapped to the next video keeps it.
 */
const controllerOptions = {
    prefetch: { enabled: !(userDataSaverEnabled.value || isDataSaverEnabled()) },
};
const playerExtras = computed(() => ({
    controllerOptions,
    ...(videoPlayer.acceptsNowPlaying
        ? { nowPlaying: nowPlaying.value }
        : { nowPlaying: webNowPlaying.value, appearance: isDarkTheme.value ? "dark" : "light" }),
    // Withheld until this content's own video is loaded, or the previous video's last frame shows under it.
    ...(props.inline && videoPlayer.acceptsInline && playingThisContent() ? { inline: props.inline, captionBand: props.captionBand, inlineBadge: props.inlineBadge === true, inlineRadius: props.inlineRadius ?? 0 } : {}),
    // The media player's picture takes the video's own shape, so cover only trims a sliver of rounding at its edges.
    ...(props.inline && !videoPlayer.acceptsInline ? { windowedFit: "cover" as const } : {}),
    ...(props.captionsHidden ? { captionsHidden: true } : {}),
    ...(videoPlayer.acceptsBrowse && props.upNext?.length ? { upNext: props.upNext } : {}),
    ...(videoPlayer.acceptsNextUp && props.nextUp?.length ? { nextUp: props.nextUp } : {}),
}));

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
 * bare unless `windowedControls` asks for the player's own; full-screen still shows the player's controls. A YouTube link keeps the embed's own,
 * having no controller for the media player to drive.
 *
 * The subtitles menu is on: the media player's own menu and the phone's full-screen menu list a stream's
 * subtitles, so the web full screen does too. It shows only for a stream that has some.
 */
const controls = computed(() =>
    isYouTubeUrl(videoSource.value)
        ? { subtitlesMenu: false, audioVideoToggle: false }
        : {
              subtitlesMenu: true,
              audioVideoToggle: false,
              windowedControls: !!props.windowedControls,
          },
);

/**
 * A video hosted by YouTube. The player package has no YouTube mode, so the app shows YouTube's own embed,
 * behind a notice: see `YouTubeWrapper`.
 */
const youtubeUrl = computed(() =>
    isYouTubeLink(videoSource.value) ? videoSource.value : undefined,
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
 * The language the encoder saves chapters in: one, for now, English (`chapters/en.vtt`). The player
 * loads the track that matches the viewer's language, else the first, so offering a language the
 * encoder has not written would leave a viewer in it with no chapters at all.
 */
const CHAPTERS_LANGUAGE = "en";
type ChapterSidecar = NonNullable<NonNullable<PlayerSource["sidecars"]>["chapters"]>[number];

/**
 * Where a video's chapters would be: `chapters/en.vtt` beside its master playlist. Offered
 * for every video; a video without them has no file there, and the player shows no chapters.
 */
function chapterSidecars(masterUrl: string): ChapterSidecar[] {
    const path = masterUrl.split(/[?#]/)[0] ?? masterUrl;
    const slash = path.lastIndexOf("/");
    if (slash < 0) return [];
    const folder = path.slice(0, slash);
    return [{ lang: CHAPTERS_LANGUAGE, url: `${folder}/chapters/${CHAPTERS_LANGUAGE}.vtt` }];
}

/**
 * Where a video's scrub frames would be: `thumbnails/thumbnails.vtt` beside its master playlist. Offered for
 * every video like the chapters; an encode without them has no file there, and the player shows no
 * scrub preview.
 */
function thumbnailSidecar(masterUrl: string): { url: string } | undefined {
    const path = masterUrl.split(/[?#]/)[0] ?? masterUrl;
    const slash = path.lastIndexOf("/");
    if (slash < 0) return undefined;
    return { url: `${path.slice(0, slash)}/thumbnails/thumbnails.vtt` };
}

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
        sidecars: { chapters: chapterSidecars(url), thumbnails: thumbnailSidecar(url) },
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

/**
 * The source the player is mounted with. A new content never unmounts the player: that would end
 * full-screen, and the swap to the next video must stay in it. The previous source stays in place until
 * the new one is ready, and is dropped only when the new content has no video to play.
 */
const heldSource = shallowRef<PlayerSource | null>(null);
/** The content `heldSource` was made for: events from the previous video must not be booked to the next. */
const heldContentId = ref<string | undefined>(undefined);
watch(
    source,
    (current) => {
        if (current) {
            heldSource.value = current;
            heldContentId.value = props.content?._id;
        } else if (!videoSource.value) {
            heldSource.value = null;
            heldContentId.value = undefined;
        }
    },
    { immediate: true },
);
const playingThisContent = () => heldContentId.value === props.content?._id;

/**
 * The video is drawn behind the page here: the poster would only cover it. Not while the previous
 * video is still the one loaded, or its last picture would show through under the next one's cover.
 */
const inlineActive = computed(
    () => !!props.inline && player.value?.inlineActive === true && playingThisContent(),
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

/** Each save rewrites localStorage and re-renders every progress tile, so `timeupdate`'s rate is too often. */
const PROGRESS_SAVE_INTERVAL_SECONDS = 10;
type ProgressPoint = { mediaId: string; contentId: string; time: number; duration: number };
/** The latest position, saved on the interval and once more when playback stops or the page goes. */
let pendingProgress: ProgressPoint | undefined;
let savedProgress: ProgressPoint | undefined;

function saveProgress(point: ProgressPoint) {
    setMediaProgress(point.mediaId, point.contentId, point.time, point.duration);
    savedProgress = point;
}

function flushProgress() {
    if (pendingProgress && pendingProgress !== savedProgress) saveProgress(pendingProgress);
}

function forgetProgress() {
    pendingProgress = undefined;
    savedProgress = undefined;
}
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

/**
 * Where the video starts (the saved position, playing on its own) is for the first load only. The
 * player loads again for another angle, audio or video, or after a recovery, and those keep the
 * position and the play state they had: a paused video stays paused where it is.
 */
let startHandled = false;
/** Until this content's own metadata arrives, the time reported is still the previous video's, and is not its progress. */
let loadedContentId: string | undefined;
watch(
    () => props.content._id,
    () => (startHandled = false),
);

function onLoadedMetadata() {
    if (!playingThisContent()) return;
    loadedContentId = props.content._id;
    leaving = false;
    completed = false;
    watchTracker.reset();
    forgetProgress();
    const id = mediaId.value;
    if (!id) return;
    if (startHandled) return;
    startHandled = true;

    const progress = getMediaProgress(id, props.content._id);
    if (progress > MIN_RESUME_SECONDS) player.value?.seek(progress - RESUME_REWIND_SECONDS);

    // A video hosted by YouTube plays in its own frame, started by the viewer, in the page: it neither
    // needs a play nor goes full-screen, which is for a player that shows video only there.
    if (youtubeUrl.value) return;

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
    // The video being swapped out is still playing while the next one's key is fetched.
    if (leaving || !playingThisContent() || loadedContentId !== props.content._id) return;
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

    pendingProgress = { mediaId: id, contentId: props.content._id, time: currentTime, duration };
    if (
        !savedProgress ||
        savedProgress.mediaId !== id ||
        Math.abs(currentTime - savedProgress.time) >= PROGRESS_SAVE_INTERVAL_SECONDS
    ) {
        saveProgress(pendingProgress);
    }
}

watch(
    () => player.value?.state?.playing,
    (playing) => {
        if (playing === false) flushProgress();
    },
);

function flushWhenHidden() {
    if (document.visibilityState === "hidden") flushProgress();
}
onMounted(() => document.addEventListener("visibilitychange", flushWhenHidden));
onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", flushWhenHidden);
    flushProgress();
});

/** The viewer closed the next-video card, so the end of this video leaves full-screen as usual. */
const nextUpDismissed = ref(false);
watch(
    () => props.content._id,
    () => (nextUpDismissed.value = false),
);

/** Books the playthrough as finished: the progress goes, and the completion is scored once. */
function finishPlaythrough(): boolean {
    const id = mediaId.value;
    if (!id || completed) return false;
    completed = true;

    forgetProgress();
    removeMediaProgress(id, props.content._id);

    // Nothing to score if the watched fraction already claimed it.
    if (watchTracker.claimCompletion()) applyCompletion();
    return true;
}

/**
 * The next video was chosen (or this one ended into it): this one is done, and full-screen stays.
 * Paused so its last moments are not booked as the next video's progress while that one loads.
 */
let leaving = false;
function onNextUpSelect(id: string) {
    if (playingThisContent()) {
        finishPlaythrough();
        leaving = true;
        player.value?.pause();
    }
    emit("nextupselect", id);
}

function onEnded() {
    if (!playingThisContent() || !finishPlaythrough()) return;

    // A next video offered stays in full-screen: the swap carries on in it.
    if (props.nextUp?.length && videoPlayer.acceptsNextUp && !nextUpDismissed.value) return;
    player.value?.exitFullscreen();
}
</script>

<template>
    <!-- Square, as the player around it: the poster shows at its corners until the video draws. -->
    <div class="relative bg-transparent">
        <div
            v-if="inlineActive"
            class="aspect-video w-full"
        />
        <LImage
            v-else
            :image="content.parentImageData"
            aspectRatio="video"
            size="post"
            :rounded="false"
            :content-parent-id="content.parentId"
            :parent-image-bucket-id="content.parentImageBucketId"
        />

        <div
            ref="playerWrapper"
            class="video-player absolute bottom-0 left-0 right-0 top-0"
        >
            <YouTubeWrapper
                v-if="youtubeUrl"
                ref="player"
                :content="content"
                :url="youtubeUrl"
                @loadedmetadata="onLoadedMetadata"
                @timeupdate="onTimeUpdate"
                @ended="onEnded"
            />
            <component
                :is="videoPlayer.component"
                v-else-if="heldSource"
                ref="player"
                :source="heldSource"
                :preferred-language="preferredLanguage"
                :controls="controls"
                :messages="playerMessages"
                v-bind="playerExtras"
                @loadedmetadata="onLoadedMetadata"
                @timeupdate="onTimeUpdate"
                @ended="onEnded"
                @upnextselect="emit('upnextselect', $event)"
                @nextupselect="onNextUpSelect"
                @nextupdismiss="nextUpDismissed = true"
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
