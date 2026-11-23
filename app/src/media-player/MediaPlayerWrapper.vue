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
    findPreferredTrack,
    isYouTubeUrl,
    type PlayerSource,
} from "@luminary-media-converter/player-web";
import { LuminaryPlayer, type PlayerUpNextItem } from "@/media-player/player";
import { type ContentDto, fetchHlsKey, reportError } from "luminary-shared";
import { ensureFreshToken } from "@/auth";
import LImage from "@/components/images/LImage.vue";
import { useKnownTexts, usePlayerMessages } from "@/media-player/usePlayerMessages";
import YouTubeWrapper from "./YouTubeWrapper.vue";
import { warmFetch, warmPlaylists } from "./playlistWarm";
import { isYouTubeLink } from "@/util/youtube";
import { appLanguagesPreferredAsRef, isDarkTheme, queryParams } from "@/globalConfig";
import { playbackDataSaverLevel, playbackDataSaverOn, playOnlineOverride } from "./mediaPlayer";
import {
    connectionSpeed,
    hasMeasuredConnectionSpeed,
} from "@/composables/useNetworkSpeedEstimator";
import {
    FINISHED_PROGRESS_PERCENT,
    getMediaProgress,
    isMediaCompleted,
    isMediaFinished,
    markMediaCompleted,
    MIN_MEDIA_PROGRESS_SECONDS,
    mediaProgressKey,
    setMediaProgress,
} from "@/contentProgress";
import { affinityConfig } from "@/recommendation/defaultAffinityStore";
import { recordMediaCompletion } from "./mediaCompletion";
import { fallbackArtworkDataUrl } from "@/util/fallbackArtwork";
import { deviceOnline, offlineArtworkDataUrl } from "./cachedArtwork";
import { audioLanguageFor, audioLanguagePreference } from "./audioLanguage";
import { resolveMediaSource, mediaSourceFor } from "@/util/mediaSource";
import { useBucketInfo } from "@/composables/useBucketInfo";
import { createMediaWatchTracker } from "@/recommendation/mediaWatchTracker";
import { shareImageUrl } from "@/composables/useSocialShare";
import { VideoPlayerKey } from "@/build-time/contracts/video-player/token";
import type {
    VideoDownloadAction,
    VideoNowPlaying,
    VideoNowPlayingAction,
    VideoMiniPlayerAction,
    VideoPlayerHandle,
} from "@/build-time/contracts/video-player/contract";
import { useDownloads } from "@/build-time/contracts/downloads/token";
import type {
    DownloadPlayback,
    DownloadPlaybackCloseReason,
    DownloadsPlayer,
} from "@/build-time/contracts/downloads/contract";
import {
    closedNoticeKey,
    downloadChapters,
    holdsMaterialAfter,
    holdsPosition,
    selectionOf,
} from "./downloadPlayback";
import {
    actOnPlayerNotice,
    clearPlayerNotice,
    dismissPlayerNotice,
    showPlayerNotice,
} from "./playerNotice";

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
const emit = defineEmits<{
    upnextselect: [id: string];
    nextupselect: [id: string];
    /** What the platform's own now-playing screen asks of the page. */
    nowplayingaction: [action: VideoNowPlayingAction, value?: string];
    /** What the viewer did on the platform's own minimised player. */
    miniplayeraction: [action: VideoMiniPlayerAction];
    /** A downloads control of the platform's now-playing screen that only the page can act on. */
    downloadaction: [action: VideoDownloadAction];
}>();

/**
 * The player's own strings, in the language of the app: the web and the native player take the
 * same keys, and each uses the ones it has. The skip texts keep their `{seconds}` for the player
 * to fill in with its own interval.
 */
const playerMessages = usePlayerMessages();

function passNowPlayingAction(action: VideoNowPlayingAction, value?: string) {
    if (value === undefined) emit("nowplayingaction", action);
    else emit("nowplayingaction", action, value);
}

// The browser's player when no service is provided: a component mounted on its own.
const videoPlayer = inject(VideoPlayerKey, {
    component: LuminaryPlayer,
    acceptsNowPlaying: false,
    acceptsBrowse: true,
    acceptsNextUp: true,
});
const player = ref<VideoPlayerHandle | null>(null);

const downloads = useDownloads();
/**
 * The downloads' hooks for the player, where there is a downloads service and a player that plays downloads; without
 * them every item streams. Read at each use: the player can say it plays downloads after this wrapper was set up.
 */
const downloadsPlayer = () => (videoPlayer.playsDownloads ? downloads.value?.player : undefined);
/** The download the content plays from; null while it streams. */
const playback = shallowRef<DownloadPlayback | null>(null);
/** The session the engine closed itself: its load is stopped, and nothing more of it is booked. */
let closedPlaybackId: string | null = null;
/** A start in a part the download does not hold: the saved position stays until playback moves off this point. */
let holdSavedAt: number | undefined;
/** A switch of copy is loading: the old load's last times are not this one's. */
let reloading = false;
/** Whether to play once the switched copy has loaded. */
let playAfterReload = false;
/** More is ready while playing: the viewer was asked, and the switch happens at the next pause anyway. */
let switchAsked: string | undefined;
/** The download the viewer picked on the sheet, while it opens: a second open would supersede the pick. */
let chosenSwitch: Promise<boolean> | undefined;
/** The item more became ready for while {@link chosenSwitch} opened, decided once the pick has settled. */
let readyDuringChoice: string | undefined;
/**
 * The last position known, in full-item time. A load resets the player's state to 0 and paused until it reports a
 * time, so until then the position is the one the load was given.
 */
let lastFull: number | undefined;
/** The current load has reported a time: the player's state holds this load's position. */
let timeReported = false;
/**
 * A download played from its start: the local time its first minute counts from, carried across a switch of copy.
 * Nothing is booked before that minute has played, whatever its full time.
 */
let topBase: number | undefined;
/** The last local time reported, on the current copy's timeline: while a load has not reported, where it was sent. */
let lastLocal = 0;
/** Playback was asked to play or is playing: a load just told to play still reads as paused until it starts. */
let playIntent = false;
/** Drops a play asked for that never started; see {@link PLAY_INTENT_GRACE_MS}. */
let playIntentTimer: ReturnType<typeof setTimeout> | undefined;
/** Where a session the engine closed had got to, for the stream that may replace it. */
let closedAt: number | undefined;
/** The session a fallback to the stream replaced: the engine's close of it still tells the viewer why. */
let replacedPlaybackId: string | null = null;
let unmounted = false;
/** A string the language may not have yet: its English shows rather than the bare key. */
const { textOr } = useKnownTexts();

// The media bucket, so a stored relative URL can be resolved to a fetchable
// one — see resolveMediaSource.
const mediaBucketIdRef = computed(() => props.content?.parentMediaBucketId);
const { bucketBaseUrl: mediaBucketBaseUrl } = useBucketInfo(mediaBucketIdRef);

const mediaSource = computed(() => resolveMediaSource(props.content, mediaBucketBaseUrl.value));

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
const nowPlaying = computed<VideoNowPlaying>(() => {
    // Offline, native cannot fetch from the bucket: the picture goes as data, from what the browser holds. A download
    // carries its own.
    const artworkUrl =
        playback.value?.artworkUrl ??
        (deviceOnline.value
            ? shareImageUrl(props.content, imageBucketBaseUrl.value)
            : offlineArtwork.value);
    return {
        title: props.content.title,
        ...(props.content.author ? { subtitle: props.content.author } : {}),
        ...(artworkUrl ? { artworkUrl } : {}),
        ...(fallbackArtworkUrl.value ? { fallbackArtworkUrl: fallbackArtworkUrl.value } : {}),
        ...(mediaId.value
            ? { progressKey: mediaProgressKey(mediaId.value, props.content._id) }
            : {}),
    };
});
/** The post's picture as data while the device is offline; see {@link offlineArtworkDataUrl}. */
const offlineArtwork = ref<string | undefined>(undefined);
watch(
    [deviceOnline, () => props.content?._id, imageBucketBaseUrl],
    async ([online]) => {
        offlineArtwork.value = undefined;
        const content = props.content;
        if (online || !content) return;
        const made = await offlineArtworkDataUrl(content, imageBucketBaseUrl.value);
        if (props.content?._id === content._id && !deviceOnline.value) offlineArtwork.value = made;
    },
    { immediate: true },
);
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
 * What the player's controller is given when the player is built: Data Saver turns the background warming of the
 * next chunk off, since a warm is an extra request nobody asked for. The controller reads `prefetch` on each load,
 * so a change mid-play takes effect from the next load (the next video, or a reload lifting the cap).
 */
const prefetch = { enabled: !playbackDataSaverOn.value };
watch(playbackDataSaverOn, (on) => (prefetch.enabled = !on));
const controllerOptions = {
    prefetch,
    // The playlists warmed beside the key (see `warmPlaylists`) are answered from memory.
    fetchImpl: warmFetch,
};
const playerExtras = computed(() => ({
    controllerOptions,
    // Saving data, the scrub frames are fetched as they are reached rather than ahead; the player itself
    // holds back while only sound plays.
    lazyThumbnails: playbackDataSaverOn.value,
    ...(videoPlayer.acceptsNowPlaying
        ? { nowPlaying: nowPlaying.value }
        : {
              nowPlaying: webNowPlaying.value,
              appearance: isDarkTheme.value ? "dark" : "light",
              dataSaver: playbackDataSaverLevel.value,
          }),
    // Withheld until this content's own video is loaded, or the previous video's last frame shows under it.
    ...(props.inline && videoPlayer.acceptsInline && playingThisContent()
        ? {
              inline: props.inline,
              captionBand: props.captionBand,
              inlineBadge: props.inlineBadge === true,
              inlineRadius: props.inlineRadius ?? 0,
          }
        : {}),
    // The media player's picture takes the video's own shape, so cover only trims a sliver of rounding at its edges.
    ...(props.inline && !videoPlayer.acceptsInline ? { windowedFit: "cover" as const } : {}),
    ...(props.captionsHidden ? { captionsHidden: true } : {}),
    ...(videoPlayer.acceptsBrowse && props.upNext?.length ? { upNext: props.upNext } : {}),
    ...(videoPlayer.acceptsNextUp && props.nextUp?.length ? { nextUp: props.nextUp } : {}),
    // A download's built master names only what it holds; the list shows every chapter, those it lacks unavailable.
    ...(shownChapters.value ? { chapters: shownChapters.value } : {}),
}));

const shownChapters = computed(() => {
    const local = playback.value;
    if (!local || !playingThisContent()) return undefined;
    return downloadChapters(downloads.value?.entryFor(props.content.parentId), local.timeline);
});

/**
 * What the progress store calls this video. The stored URL rather than the resolved
 * one, because ContentTile knows only the stored form, and a bucket re-pointed or
 * renamed must not lose the viewer's position. Content with no media of its own (a download's stand-in for a doc not
 * on the device) goes by the address the download kept: only progress is keyed by it, nothing streams from it.
 */
const mediaId = computed(
    () =>
        mediaSourceFor(props.content) ??
        downloads.value?.entryFor(props.content.parentId)?.content.mediaId,
);

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
 * The language the viewer last switched the audio to wins where this stream has it; else the prop when the caller
 * sets one, else the viewer's first preferred app language. The player matches leniently — two- and three-letter
 * codes, both ISO-639-2 sets — because browsers disagree about how they spell a track's language.
 */
const preferredLanguage = computed(() =>
    audioLanguageFor(
        player.value?.state?.audioTracks ?? [],
        props.language || appLanguagesPreferredAsRef.value[0]?.languageCode || undefined,
    ),
);
/**
 * A track picked among those on offer that is not the preferred one is the viewer's switch (in the page's menus or
 * the platform's): its language is remembered for the items after. A new list's active track is the stream's default.
 */
watch(
    [
        () => player.value?.state?.activeAudioTrackId ?? null,
        () => player.value?.state?.audioTracks,
    ] as const,
    ([id, tracks], [, before]) => {
        if (!id || !tracks?.length || tracks !== before) return;
        if (id === findPreferredTrack(tracks, preferredLanguage.value ?? "")) return;
        const lang = tracks.find((track) => track.id === id)?.lang;
        if (lang) audioLanguagePreference.value = lang;
    },
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
    isYouTubeUrl(mediaSource.value)
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
    isYouTubeLink(mediaSource.value) ? mediaSource.value : undefined,
);

/** The angle the load starts on, fixed per content so a later change of mind does not reload. */
const startAngleId = ref<string | undefined>(undefined);

/**
 * What Data Saver allows a picture: nothing above this height is offered to the player, so it can
 * be neither chosen by ABR nor picked by hand. Low enough to be cheap, high enough to be watchable.
 */
const DATA_SAVER_MAX_HEIGHT = 360;
const MIN_RESUME_SECONDS = MIN_MEDIA_PROGRESS_SECONDS;
/** Resuming lands slightly before where the viewer left, to re-establish context. */
const RESUME_REWIND_SECONDS = 30;
/**
 * Where a part-watched video picks up, read when it opens; undefined from the start or once finished. A download maps
 * the saved full-item position onto its own timeline; one that holds nothing after a completed item's position starts
 * over, as a finished item does.
 */
function resumePoint(): number | undefined {
    const id = mediaId.value;
    if (!id || !props.content) return undefined;
    const progress = getMediaProgress(id, props.content._id);
    if (!(progress > MIN_RESUME_SECONDS) || isMediaFinished(id, props.content._id))
        return undefined;
    const timeline = playback.value?.timeline;
    if (!timeline) return progress - RESUME_REWIND_SECONDS;
    if (isMediaCompleted(id, props.content._id) && !holdsMaterialAfter(timeline, progress))
        return undefined;
    return timeline.resumeLocal(progress);
}

/** A download starting away from the saved position, which it does not hold, keeps that position until it moves. */
function holdFor(resume: number | undefined): number | undefined {
    const id = mediaId.value;
    const timeline = playback.value?.timeline;
    if (resume === undefined || !id || !timeline) return undefined;
    return timeline.toLocal(getMediaProgress(id, props.content._id))?.exact ? undefined : resume;
}
/**
 * The saved position the first load starts from. Loaded there, not sought to after the start: a seek during the
 * start drew the first frame at 0 and could leave the player paused there.
 */
const resumeAt = ref<number | undefined>(undefined);
/** The cap this content loads with: a cap only takes effect on a load, so a change of it reloads the content. */
const maxHeight = ref<number | undefined>(undefined);
/** The cap changed mid-play: the reload carries on where it was, playing if it was, on the angle it was on. */
const preservePosition = ref(false);
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
/**
 * Keys already handed over this session, by media: a video opened again (from More, or back from another) loads
 * without waiting on the server for a key it already has. Only a key that arrived is kept, so a failure asks again.
 */
const keys = new Map<string, string>();
async function keyFor(parentId: string): Promise<string | undefined> {
    const known = keys.get(parentId);
    if (known) return known;
    await ensureFreshToken();
    const key = await fetchHlsKey(parentId);
    if (key) keys.set(parentId, key);
    return key;
}
/** What the player's ABR starts from when nothing better is known: one megabit, a phone's slow-but-working start. */
const FALLBACK_BANDWIDTH_BPS = 1_000_000;
/**
 * The connection speed the player starts from, always given: the app's own measure, else the browser's (`downlink`,
 * in Mbit/s), else {@link FALLBACK_BANDWIDTH_BPS}. A native engine with no hint would use a table of its own, and
 * where it starts has to match what the page expects it to.
 */
function startingBandwidth(): number {
    if (hasMeasuredConnectionSpeed.value) return Math.round(connectionSpeed.value * 1_000_000);
    const downlink = (navigator as Navigator & { connection?: { downlink?: number } }).connection
        ?.downlink;
    return downlink && downlink > 0 ? Math.round(downlink * 1_000_000) : FALLBACK_BANDWIDTH_BPS;
}
/** How long a load waits for the stand-in artwork before going without it. */
const ARTWORK_WAIT_MS = 150;
const delay = (ms: number) =>
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms));

/**
 * Data Saver is a 360p cap. Where the engine holds it in place (hls.js on the web, ExoPlayer), it moves at once with
 * the setting: on, ABR stays beneath it and the qualities above it leave the list; off, it goes, Auto is set and ABR
 * climbs. A quality picked by hand stands while it is on.
 */
watch(
    [playbackDataSaverOn, () => player.value?.controller ?? null] as const,
    ([on, controller]) => {
        if (playback.value) return;
        controller?.setMaxHeight?.(on ? DATA_SAVER_MAX_HEIGHT : null);
    },
);

/**
 * Where the engine cannot hold the cap in place (AVPlayer): Data Saver turned on or off mid-play sets or lifts it by
 * loading the same content again in place, on the angle it is on. False when the cap already matches.
 */
function syncDataSaverCap(): boolean {
    // A download holds the one quality it was saved in.
    if (player.value?.controller?.canCapInPlace || !props.content || playback.value) return false;
    const cap = playbackDataSaverOn.value ? DATA_SAVER_MAX_HEIGHT : undefined;
    if (maxHeight.value === cap) return false;
    startAngleId.value = player.value?.state?.activeAngleId ?? startAngleId.value;
    preservePosition.value = true;
    maxHeight.value = cap;
    return true;
}

const source = computed<PlayerSource | null>(() => {
    const local = playback.value;
    if (local && keyResolved.value) {
        // The built master names the stored chapters itself, already on the download's timeline.
        return {
            masterUrl: local.masterUrl,
            ...(local.keyHex ? { keyHex: local.keyHex } : {}),
            startAngleId: startAngleId.value,
            ...(preservePosition.value ? { preservePosition: true } : {}),
            ...(resumeAt.value !== undefined ? { startPosition: resumeAt.value } : {}),
            bandwidthEstimate: bandwidthEstimate.value,
            sidecars: local.thumbnailsUrl ? { thumbnails: { url: local.thumbnailsUrl } } : {},
        };
    }
    const url = mediaSource.value;
    if (!url || !keyResolved.value) return null;
    return {
        masterUrl: url,
        keyHex: keyHex.value,
        startAngleId: startAngleId.value,
        maxHeight: maxHeight.value,
        // Held in place where the engine can, so the setting moves it with no reload.
        maxHeightInPlace: true,
        ...(preservePosition.value ? { preservePosition: true } : {}),
        ...(resumeAt.value !== undefined ? { startPosition: resumeAt.value } : {}),
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
        forgetDownload();
        lastFull = undefined;
        lastLocal = 0;
        timeReported = false;
        topBase = undefined;
        dropPlayIntent();
        const content = props.content;
        const contentId = content?._id;
        const artwork = fallbackArtworkDataUrl(content?.parentId);
        // The playlists are fetched while the key is, rather than after it; a download about to play needs neither.
        const masterUrl = mediaSource.value;
        const hooks = downloadsPlayer();
        const opens = !!hooks && !!content && !isYouTubeLink(masterUrl);
        if (masterUrl && !isYouTubeUrl(masterUrl) && !(opens && likelyPlaysDownload(content)))
            warmPlaylists(masterUrl);
        startAngleId.value = props.startAudio ? AUDIO_ONLY_ANGLE_ID : undefined;
        maxHeight.value = playbackDataSaverOn.value ? DATA_SAVER_MAX_HEIGHT : undefined;
        preservePosition.value = false;
        const opened = opens && hooks && content ? await openDownload(hooks, content) : null;
        if (unmounted || (opens && props.content?._id !== contentId)) {
            // Another item took the player while this one opened, or the player went: it never loads the session.
            void opened?.close().catch(() => undefined);
            return;
        }
        playback.value = opened;
        resumeAt.value = resumePoint();
        holdSavedAt = holdFor(resumeAt.value);
        lastFull = fullAt(resumeAt.value);
        lastLocal = resumeAt.value ?? 0;
        topBase = opened && resumeAt.value === undefined ? 0 : undefined;
        bandwidthEstimate.value = startingBandwidth();
        try {
            const parentId = props.content?.parentId;
            // A download carries its own key; no online key is fetched for it.
            if (!opened && parentId && props.content?.parentMedia?.hlsKey_id) {
                keyHex.value = await keyFor(parentId);
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
            // The stand-in artwork goes with the load when it is quick; a slow one (up to its own give-up time) must
            // not hold the video back, so it follows as an update of what plays.
            const made = await Promise.race([artwork, delay(ARTWORK_WAIT_MS)]);
            // Another post may have taken the player while this one was being made: its own run answers for it.
            if (props.content?._id === contentId) {
                if (made) fallbackArtworkUrl.value = made;
                else
                    void artwork.then((late) => {
                        if (late && props.content?._id === contentId)
                            fallbackArtworkUrl.value = late;
                    });
                keyResolved.value = true;
            }
        }
    },
    { immediate: true },
);

/**
 * The key could not be had when the video opened (offline, or the server was away), so every load would fail for
 * want of it. It is asked for again when the network comes back, and when the player fails without it (its "Try
 * again"); a key that arrives makes a new source, which the player loads.
 */
const keyMissing = () =>
    keyResolved.value &&
    !playback.value &&
    !keyHex.value &&
    !!props.content?.parentId &&
    !!props.content?.parentMedia?.hlsKey_id;
let keyRefetch: Promise<void> | null = null;
function refetchKey(): void {
    if (!keyMissing() || keyRefetch) return;
    const contentId = props.content?._id;
    const parentId = props.content!.parentId;
    keyRefetch = keyFor(parentId)
        .then((key) => {
            if (key && props.content?._id === contentId) keyHex.value = key;
        })
        .catch(() => {
            // Still out of reach: the next way back (online, or another try) asks again.
        })
        .finally(() => (keyRefetch = null));
}
const onOnline = () => refetchKey();
onMounted(() => window.addEventListener("online", onOnline));
onBeforeUnmount(() => window.removeEventListener("online", onOnline));
watch(
    () => player.value?.state?.lifecycle,
    (lifecycle) => {
        if (lifecycle === "error") refetchKey();
    },
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
        } else if (!mediaSource.value && !playback.value) {
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
    recordMediaCompletion(props.content);
}

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
    if (reloading) {
        reloading = false;
        if (playAfterReload) requestPlay();
        playAfterReload = false;
    }
    if (startHandled) return;
    startHandled = true;

    // The player loads from the saved position (`startPosition`); YouTube's frame is told where to go.
    if (youtubeUrl.value) {
        const resume = resumePoint();
        if (resume !== undefined) player.value?.seek(resume);
    }

    // A video hosted by YouTube plays in its own frame, started by the viewer, in the page: it neither
    // needs a play nor goes full-screen, which is for a player that shows video only there.
    if (youtubeUrl.value) return;

    if (autoPlay || props.autoplay) requestPlay();
    if (
        autoFullscreen ||
        (props.autoplay && props.fullscreenOnPlay && !props.startAudio && !inlineActive.value)
    ) {
        void player.value?.enterFullscreen();
    }
}

/** Which copy plays now, for the download tool; undefined without downloads. */
const playingSource = computed<"downloaded" | "online" | undefined>(() =>
    downloadsPlayer() ? (playback.value ? "downloaded" : "online") : undefined,
);

defineExpose({
    player,
    inlineActive,
    syncDataSaverCap,
    playback,
    playingSource,
    streamOffersVideo: computed(() => streamOffersVideo.value),
    streamForVideo: () => streamForVideo(),
    downloadForSound: () => downloadForSound(),
});

/**
 * Progress is stored in full-item time against the full duration: a download's own, shorter timeline is converted
 * back, so a position lands on the same word whichever copy plays.
 */
function onTimeUpdate(localTime: number, localDuration: number) {
    // The video being swapped out is still playing while the next one's key is fetched.
    if (leaving || !playingThisContent() || loadedContentId !== props.content._id) return;
    if (reloading || closedPlaybackId) return;
    // A load resets the player to 0 before it has loaded anything: that is not where the viewer is.
    if (loadingNow()) return;
    const timeline = playback.value?.timeline;
    const currentTime = timeline ? timeline.toFull(localTime) : localTime;
    const duration = timeline ? timeline.fullDuration : localDuration;
    lastFull = currentTime;
    lastLocal = localTime;
    timeReported = true;
    watchTracker.track(currentTime);
    if (
        watchTracker.claimCompletionIfWatched(duration, affinityConfig.value.mediaCompletionPercent)
    ) {
        // The saved progress deliberately stays put — there is still a tail to resume.
        applyCompletion();
    }

    // Released whatever the time, so a stream taking over in the first minute starts where playback is.
    if (holdSavedAt !== undefined && Math.abs(localTime - holdSavedAt) >= 1)
        holdSavedAt = undefined;

    const id = mediaId.value;
    if (!id || duration === Infinity || currentTime < MIN_RESUME_SECONDS) return;

    // A fallback for an `ended` that never arrives, which is the normal case on
    // YouTube. One second short of the duration is as close as a `timeupdate`
    // reliably gets.
    if (localDuration > 0 && localTime >= localDuration - 1) {
        if (!completed) onEnded();
        return;
    }
    if (holdSavedAt !== undefined) return;
    // Played again from the start after its end: the first minute counts again before anything is booked.
    if (completed && timeline && localTime < MIN_RESUME_SECONDS) topBase = 0;
    if (topBase !== undefined && timeline) {
        if (localTime - topBase < MIN_RESUME_SECONDS) return;
        topBase = undefined;
    }
    // Played on below the end of a download: reaching its end again sets the completed mark again.
    if (timeline) completed = false;

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
// A pause the player reports after playing ends the intent to play; the reset to paused a load brings does not.
watch(
    () => player.value?.state?.playing,
    (playing, was) => {
        if (playing === true) {
            playIntent = true;
            clearTimeout(playIntentTimer);
        } else if (was === true) {
            // A load's reset may hide the viewer's pause before it plays again: the intent then runs out as a play's does.
            if (reloading || loadingNow()) armPlayIntentExpiry();
            else dropPlayIntent();
        }
    },
);

function flushWhenHidden() {
    if (document.visibilityState === "hidden") flushProgress();
}
onMounted(() => document.addEventListener("visibilitychange", flushWhenHidden));
onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", flushWhenHidden);
    clearTimeout(playIntentTimer);
    flushProgress();
});

/** The viewer closed the next-video card, so the end of this video leaves full-screen as usual. */
const nextUpDismissed = ref(false);
watch(
    () => props.content._id,
    () => (nextUpDismissed.value = false),
);

/**
 * Books the playthrough as finished: the progress is kept as complete, and the completion is scored once. `atEnd`:
 * playback reached the end of what is loaded, rather than the viewer moving on to the next video.
 */
function finishPlaythrough(atEnd: boolean): boolean {
    const id = mediaId.value;
    if (!id || completed) return false;
    completed = true;

    // Media under MIN_RESUME_SECONDS never reaches the store, and stays out of it.
    const point = pendingProgress ?? savedProgress;
    forgetProgress();
    const timeline = playback.value?.timeline;
    let finished = true;
    if (timeline) {
        // A download finishes the item only from a position past the finished line: at its end, the last span's end
        // (the position native books for the same end); moving on mid-item, the word the viewer was at. Short of
        // the line it leaves the completed mark there instead, so either copy resumes at it; below the minimum no
        // position is kept, as for any other write.
        const end = timeline.spans.at(-1)?.fullEnd ?? timeline.toFull(timeline.localDuration);
        const full = timeline.fullDuration;
        const at = atEnd ? end : point?.time;
        finished = full > 0 && at !== undefined && (at / full) * 100 >= FINISHED_PROGRESS_PERCENT;
        if (finished) {
            if (point || full >= MIN_RESUME_SECONDS)
                setMediaProgress(id, props.content._id, full, full);
        } else if (at !== undefined && at >= MIN_RESUME_SECONDS)
            markMediaCompleted(id, props.content._id, at, full);
    } else if (point) setMediaProgress(id, props.content._id, point.duration, point.duration);

    // Nothing to score if the watched fraction already claimed it; a partial download scores only by that fraction.
    if (finished && watchTracker.claimCompletion()) applyCompletion();
    return true;
}

/**
 * The next video was chosen (or this one ended into it): this one is done, and full-screen stays.
 * Paused so its last moments are not booked as the next video's progress while that one loads.
 */
let leaving = false;
function onNextUpSelect(id: string) {
    if (playingThisContent()) {
        finishPlaythrough(false);
        leaving = true;
        player.value?.pause();
    }
    emit("nextupselect", id);
}

function onEnded() {
    if (!playingThisContent() || !finishPlaythrough(true)) return;

    // A next video offered stays in full-screen: the swap carries on in it.
    if (props.nextUp?.length && videoPlayer.acceptsNextUp && !nextUpDismissed.value) return;
    player.value?.exitFullscreen();
}

// --- downloads ------------------------------------------------------------

function online(): boolean {
    return downloads.value?.network.value.online ?? deviceOnline.value;
}

/** Online is chosen for the item: by the viewer here, else on the download sheet. */
function prefersOnline(): boolean {
    const override = playOnlineOverride.value;
    if (override !== null) return override;
    return downloadsPlayer()?.sourceOverride(props.content.parentId) === "online";
}

/** A download is likely to play, so the stream's playlists are not warmed for it. */
function likelyPlaysDownload(content: ContentDto): boolean {
    return (
        !!downloads.value?.playableParentIds.value.has(content.parentId) &&
        !(prefersOnline() && online())
    );
}

/** The session open but not handed to the player, which nothing else will release. */
function unloadedSession(): DownloadPlayback | null {
    const local = playback.value;
    return local && heldSource.value?.masterUrl !== local.masterUrl ? local : null;
}

function forgetDownload() {
    void unloadedSession()
        ?.close()
        .catch(() => undefined);
    playback.value = null;
    closedPlaybackId = null;
    closedAt = undefined;
    replacedPlaybackId = null;
    holdSavedAt = undefined;
    reloading = false;
    playAfterReload = false;
    if (switchAsked) clearPlayerNotice(switchAsked);
    switchAsked = undefined;
}

/**
 * The download to play, or null to stream. A playable download that does not open online also streams; the service
 * tells the viewer why.
 */
async function openDownload(
    hooks: DownloadsPlayer,
    content: ContentDto,
): Promise<DownloadPlayback | null> {
    try {
        return await hooks.open(content, { preferOnline: prefersOnline() });
    } catch {
        // Offline there is nothing else to play: the stream's own failure is what the viewer sees.
        return null;
    }
}

function noticeFallback() {
    showPlayerNotice({
        text: textOr(
            "downloads.notice.streaming_fallback",
            "Playing online: the download could not be played",
        ),
    });
}

/** A position on the current copy's timeline, in full-item time; undefined is its start. */
function fullAt(local: number | undefined): number {
    const time = local ?? 0;
    return playback.value ? playback.value.timeline.toFull(time) : time;
}

/**
 * Where playback is, in full-item time: while a load runs and until it reports a time, where it was sent. A load's
 * reset to 0 can reach a watcher before the lifecycle does.
 */
function fullPosition(): number {
    if (reloading || !timeReported || loadingNow()) return lastFull ?? 0;
    return fullAt(player.value?.state?.currentTime);
}

/**
 * Where a stream that takes over from the download starts: while the saved position is still held, the stream holds
 * it, so it opens at its own resume point (undefined) rather than at the download's stand-in start.
 */
function streamPosition(): number | undefined {
    return holdSavedAt !== undefined ? undefined : fullPosition();
}

function loadingNow(): boolean {
    const lifecycle = player.value?.state?.lifecycle;
    return lifecycle === "loading" || lifecycle === "waiting-for-master";
}

/**
 * How long after a load has settled a play asked for may take to start. Past it, a player still paused was paused
 * by the viewer in the start-up gap, or never started, and does not count as playing.
 */
const PLAY_INTENT_GRACE_MS = 3_000;
/** Graces a start still buffering may take in all, so an engine that never says it has data cannot hold it for good. */
const PLAY_INTENT_MAX_GRACES = 10;

function requestPlay() {
    playIntent = true;
    armPlayIntentExpiry();
    void player.value?.play();
}

/**
 * Still on its way to playing: the engine reports itself stuck, or holds nothing ahead of the playhead yet. A player
 * the viewer paused keeps buffering ahead, so this does not hold their pause.
 */
function stillStarting(): boolean {
    const state = player.value?.state;
    if (!state) return false;
    return (
        state.stalled === true ||
        (typeof state.bufferedEnd === "number" && state.bufferedEnd <= state.currentTime)
    );
}

function armPlayIntentExpiry(graces = 1) {
    clearTimeout(playIntentTimer);
    playIntentTimer = setTimeout(() => {
        if (unmounted) return;
        if (reloading || loadingNow()) armPlayIntentExpiry();
        else if (player.value?.state?.playing === true) return;
        else if (graces < PLAY_INTENT_MAX_GRACES && stillStarting())
            armPlayIntentExpiry(graces + 1);
        else playIntent = false;
    }, PLAY_INTENT_GRACE_MS);
}

function dropPlayIntent() {
    playIntent = false;
    clearTimeout(playIntentTimer);
}

/** Playing, or about to: a load told to play counts before the player reports it playing. */
function playingNow(): boolean {
    return playIntent || player.value?.state?.playing === true;
}

/** The word the viewer is at: a saved position still held while the download starts elsewhere, else playback's. */
function viewerPosition(): number {
    const id = mediaId.value;
    return holdSavedAt !== undefined && id
        ? getMediaProgress(id, props.content._id)
        : fullPosition();
}

/**
 * Loads another copy of the content in place: `next`, or the stream when null, from `position` on its timeline (the
 * stream's resume point when undefined). Not `preservePosition`: under it the controller would take the engine's
 * position, which is on the old copy's timeline. The angle held carries over, and play resumes once it has loaded.
 */
function reloadAt(next: DownloadPlayback | null, position?: number, play?: boolean) {
    if (!playingThisContent()) {
        void next?.close().catch(() => undefined);
        return;
    }
    flushProgress();
    // A reload during another keeps what that one was to do: the state holds no play state until a load reports.
    playAfterReload = play ?? (reloading ? playAfterReload : playingNow());
    startAngleId.value = player.value?.state?.activeAngleId ?? startAngleId.value;
    preservePosition.value = false;
    holdSavedAt = undefined;
    closedPlaybackId = null;
    closedAt = undefined;
    reloading = true;
    timeReported = false;
    const playedFromTop = topBase !== undefined ? Math.max(0, lastLocal - topBase) : undefined;
    playback.value = next;
    resumeAt.value = position ?? resumePoint();
    lastFull = fullAt(resumeAt.value);
    lastLocal = resumeAt.value ?? 0;
    // The first minute keeps counting on the new copy from what has played of it so far.
    topBase = next && playedFromTop !== undefined ? lastLocal - playedFromTop : undefined;
    if (next) return;
    maxHeight.value = playbackDataSaverOn.value ? DATA_SAVER_MAX_HEIGHT : undefined;
    streamKey();
}

/** The stream needs the key a download did without; the download keeps playing until it is in hand. */
function streamKey() {
    const parentId = props.content.parentId;
    if (keyHex.value || !props.content.parentMedia?.hlsKey_id) return;
    const contentId = props.content._id;
    keyResolved.value = false;
    keyFor(parentId)
        .then((key) => {
            if (key && props.content._id === contentId) keyHex.value = key;
        })
        .catch((error) =>
            reportError(error, { area: "player", op: "hls-key", data: { contentId } }),
        )
        .finally(() => {
            if (props.content._id === contentId) keyResolved.value = true;
        });
}

/** Streams from `position` (the stream's resume point when undefined), and keeps to it for the rest of this item. */
function streamInstead(position: number | undefined, play?: boolean) {
    playOnlineOverride.value = true;
    reloadAt(null, position, play);
}

/** A download of the sound alone plays and the stream can be reached: the picture can come from the stream. */
const streamOffersVideo = computed(
    () =>
        !!playback.value &&
        online() &&
        !!mediaSource.value &&
        downloads.value?.entryFor(props.content.parentId)?.selection.kind === "audio",
);

/** Video asked for over a download of the sound alone: the stream loads at the same word, on its default camera. */
function streamForVideo(): boolean {
    if (!streamOffersVideo.value || closedPlaybackId) return false;
    streamInstead(streamPosition());
    // The download's sound-only angle would carry over and load the stream's sound alone.
    startAngleId.value = undefined;
    return true;
}

/** The item has a download that can play now: the stream that plays instead can hand back to it. */
function downloadCanTakeOver(): boolean {
    return (
        !playback.value &&
        !!downloadsPlayer() &&
        playingThisContent() &&
        !!downloads.value?.playableParentIds.value.has(props.content.parentId)
    );
}

/**
 * Sound asked for while the stream plays an item downloaded as sound: the download plays again from the same word,
 * online or not, since it holds all the viewer now asks for.
 */
function downloadForSound(): boolean {
    if (!downloadCanTakeOver()) return false;
    if (downloads.value?.entryFor(props.content.parentId)?.selection.kind !== "audio") return false;
    playOnlineOverride.value = null;
    void chooseDownload();
    return true;
}

// Offline the stream cannot play on: the download takes over at the same word, in the mode it was downloaded in.
watch(online, (isOnline, wasOnline) => {
    if (isOnline || !wasOnline || !downloadCanTakeOver()) return;
    playOnlineOverride.value = null;
    void chooseDownload();
});

/**
 * More of the item became playable: not playing, it switches at once and stays paused; playing, the viewer is asked,
 * and it switches at the next pause either way. Nothing is offered while Online is chosen or the position is in a
 * part the download does not hold.
 */
function onMoreReady(parentId: string) {
    if (!downloadsPlayer() || parentId !== props.content.parentId) return;
    if (chosenSwitch) {
        readyDuringChoice = parentId;
        return;
    }
    if (closedPlaybackId || !playingThisContent() || !switchable()) return;
    // A switch still loading shows nothing to interrupt: the next one takes over what that one was to do.
    if (reloading || !playingNow()) {
        void switchToDownload();
        return;
    }
    if (switchAsked) return;
    switchAsked = showPlayerNotice({
        text: textOr("downloads.notice.more_chapters", "More chapters are ready."),
        action: {
            label: textOr("downloads.notice.switch_now", "Switch now"),
            run: () => void switchToDownload(),
        },
    });
}

function switchable(): boolean {
    if (prefersOnline()) return false;
    // A stream sent to a cast or AirPlay video device stays there, with the picture or the sound alone: the device
    // cannot reach the phone's files, and a load from disk ends a cast.
    if (!playback.value && player.value?.airPlayActive) return false;
    const entry = downloads.value?.entryFor(props.content.parentId);
    return !!entry && holdsPosition(entry, viewerPosition());
}

// The reset to paused a load brings is not the viewer's pause: the switch waits for the next real one.
watch(
    () => player.value?.state?.playing,
    (playing) => {
        if (playing === false && switchAsked && !reloading && !loadingNow())
            void switchToDownload();
    },
);

/**
 * Opens the download again and loads it at the same word: the position goes to full-item time on the old timeline
 * and back on the new one. `chosen`: the viewer picked the download, so it opens even where it lacks the position,
 * and also after the engine closed the session that played. Resolves false when the download did not load; true also
 * when another item took the player meanwhile.
 */
async function switchToDownload(chosen = false): Promise<boolean> {
    if (switchAsked) clearPlayerNotice(switchAsked);
    switchAsked = undefined;
    const content = props.content;
    const hooks = downloadsPlayer();
    if (!hooks || (!chosen && (closedPlaybackId || !switchable()))) return false;
    let next: DownloadPlayback | null;
    try {
        next = await hooks.open(content, { preferOnline: false });
    } catch {
        return false;
    }
    if (!next) return false;
    // A saved position still held is the word the viewer is at: the new copy may now hold it.
    const held = holdSavedAt !== undefined;
    // A closed session's player may have stopped anywhere: where it was when the engine closed it is the word.
    const target = closedPlaybackId && closedAt !== undefined ? closedAt : viewerPosition();
    const local = next.timeline.toLocal(target);
    const superseded = unmounted || props.content._id !== content._id;
    if (superseded || !local || (!chosen && !local.exact)) {
        void next.close().catch(() => undefined);
        return superseded;
    }
    reloadAt(next, held ? next.timeline.resumeLocal(target) : local.local);
    // A download of the sound alone has no camera: the stream's would name nothing in it.
    if (hooks && downloads.value?.entryFor(content.parentId)?.selection.kind === "audio") {
        startAngleId.value = AUDIO_ONLY_ANGLE_ID;
    }
    if (held) holdSavedAt = holdFor(resumeAt.value);
    return true;
}

/**
 * Opens the download the viewer picked on the sheet. More that became ready meanwhile is reported again once the pick
 * loads, should the session it opened lack it; after a failed pick it is decided as usual, once the sheet has put its
 * pick back.
 */
async function chooseDownload(): Promise<boolean> {
    const switching = switchToDownload(true);
    chosenSwitch = switching;
    let loaded = false;
    try {
        loaded = await switching;
    } finally {
        if (chosenSwitch === switching) {
            chosenSwitch = undefined;
            const ready = readyDuringChoice;
            readyDuringChoice = undefined;
            if (ready && !loaded)
                setTimeout(() => {
                    if (!unmounted) onMoreReady(ready);
                });
        }
    }
    return loaded;
}

/** The engine stopped the session itself: playback of it ends, and the viewer is told why. */
function onClosed(playbackId: string, reason: DownloadPlaybackCloseReason) {
    const [key, english] = closedNoticeKey(reason);
    if (playbackId === replacedPlaybackId && !playback.value) {
        // The stream already plays; the server checks it, so it is left alone.
        replacedPlaybackId = null;
        showPlayerNotice({ text: textOr(key, english) });
        return;
    }
    if (playback.value?.playbackId !== playbackId) return;
    flushProgress();
    // A revoked load's error may have stopped it first, where it had got to.
    const position = closedPlaybackId === playbackId ? closedAt : streamPosition();
    closedPlaybackId = playbackId;
    closedAt = position;
    if (switchAsked) clearPlayerNotice(switchAsked);
    switchAsked = undefined;
    // Online the item can still be streamed.
    const streams = online() && !!mediaSource.value;
    showPlayerNotice({
        text: textOr(key, english),
        ...(streams
            ? {
                  action: {
                      label: textOr("downloads.now_playing.chapter_online", "Play online"),
                      run: () => streamInstead(position, true),
                  },
              }
            : {}),
    });
}

/**
 * The viewer picked a copy on the download sheet: it loads at once, at the same word. Answers false when the copy
 * picked did not load, so the sheet shows its error and what played before stays.
 */
async function onSourceChosen(parentId: string, value: "downloaded" | "online"): Promise<boolean> {
    if (!downloadsPlayer() || parentId !== props.content.parentId) return true;
    const before = playOnlineOverride.value;
    playOnlineOverride.value = value === "online";
    if (value === "online" && playback.value) {
        if (online() && mediaSource.value) streamInstead(streamPosition());
        else if (!closedPlaybackId) {
            // With no stream to load, the session that plays goes on.
            playOnlineOverride.value = before;
            return false;
        }
    } else if (
        value === "downloaded" &&
        (!playback.value || closedPlaybackId) &&
        !(await chooseDownload())
    ) {
        if (playOnlineOverride.value === false) playOnlineOverride.value = before;
        return false;
    }
    return true;
}

/**
 * A download that fails to play while online streams instead; one the engine closed stays stopped until the viewer
 * tries again (the player's own retry), which online streams it, since the session would only fail again.
 */
watch(
    () => player.value?.state?.lifecycle,
    (lifecycle, before) => {
        const loading = lifecycle === "loading" || lifecycle === "waiting-for-master";
        if (loading) timeReported = false;
        if (closedPlaybackId && before === "error" && loading) {
            if (online() && mediaSource.value) streamInstead(closedAt, true);
            return;
        }
        if (lifecycle !== "error") return;
        // A load that failed is not playing: a later change is not held back as if it were.
        const wanted = playingNow() || (reloading && playAfterReload);
        dropPlayIntent();
        const local = playback.value;
        if (!local || closedPlaybackId) return;
        reloading = false;
        // The engine refused the session as revoked: it closes it, and its close says why. Native's own code comes
        // through as the error's cause.
        const cause = player.value?.state?.error?.cause as { code?: unknown } | undefined;
        if (cause?.code === "offline-revoked") {
            flushProgress();
            closedAt = streamPosition();
            closedPlaybackId = local.playbackId;
            return;
        }
        if (!online() || !mediaSource.value) return;
        noticeFallback();
        replacedPlaybackId = local.playbackId;
        playOnlineOverride.value = true;
        // Not loaded yet, it opens the stream where the stream would have opened.
        reloadAt(
            null,
            loadedContentId === props.content._id ? streamPosition() : undefined,
            wanted,
        );
    },
);

/**
 * The player says a device holds a download that plays (on iOS, any AirPlay route while the picture plays): the device
 * cannot reach the phone's files, so online the stream loads at the same position, with the picture or the sound alone
 * as it played, and the cast carries on from it.
 */
watch(
    () => player.value?.castHeldLocal === true,
    (held) => {
        if (!held || !playback.value || closedPlaybackId) return;
        if (!online() || !mediaSource.value) {
            showPlayerNotice({
                text: textOr(
                    "downloads.notice.casting_offline",
                    "Casting is not available offline",
                ),
            });
            return;
        }
        streamInstead(streamPosition());
    },
);

/** What plays, as the download sheet's preselection. */
function playingSelection() {
    const state = player.value?.state;
    const audioLanguage = state?.audioTracks.find(
        (track) => track.id === state.activeAudioTrackId,
    )?.lang;
    return selectionOf({
        audioOnly: !!state?.isAudioOnly || state?.activeAngleId === AUDIO_ONLY_ANGLE_ID,
        angleId: state?.activeAngleId,
        height: player.value?.playingHeight,
        audioLanguage,
    });
}

function onDownloadAction(action: VideoDownloadAction) {
    const index = Number(action.value);
    const chapter = Number.isInteger(index)
        ? downloads.value?.entryFor(props.content.parentId)?.chapters[index]
        : undefined;
    if (action.action === "notice") actOnPlayerNotice(action.value);
    else if (action.action === "noticeDismiss") dismissPlayerNotice(action.value);
    else if (action.action === "download")
        void downloads.value?.openSheet(props.content, {
            context: "player",
            selection: playingSelection(),
        });
    else if (action.action === "chapterDownload" && chapter)
        void downloads.value?.openSheet(props.content, {
            context: "player",
            chapter: index,
            selection: playingSelection(),
        });
    else if (action.action === "chapterOnline" && chapter && online() && mediaSource.value)
        streamInstead(chapter.startTime, true);
    else emit("downloadaction", action);
}

// Listened to whenever there is a service, since the player can say it plays downloads later.
watch(
    downloads,
    (service, _before, onCleanup) => {
        if (!service) return;
        const stops = [
            service.player.onMoreReady(onMoreReady),
            service.player.onClosed(onClosed),
            service.player.onSourceChosen(onSourceChosen),
        ];
        onCleanup(() => stops.forEach((stop) => stop()));
    },
    { immediate: true },
);
onBeforeUnmount(() => {
    unmounted = true;
    // A session handed to the player is released with it; one it never loaded is closed here.
    void unloadedSession()
        ?.close()
        .catch(() => undefined);
});
</script>

<template>
    <!-- Square, as the player around it: the poster shows at its corners until the video draws. -->
    <div class="relative bg-transparent">
        <div v-if="inlineActive" class="aspect-video w-full" />
        <LImage
            v-else
            :image="content.parentImageData"
            aspectRatio="video"
            size="post"
            :rounded="false"
            :content-parent-id="content.parentId"
            :parent-image-bucket-id="content.parentImageBucketId"
        />

        <div ref="playerWrapper" class="video-player absolute bottom-0 left-0 right-0 top-0">
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
                @nowplayingaction="passNowPlayingAction"
                @miniplayeraction="emit('miniplayeraction', $event)"
                @downloadaction="onDownloadAction"
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
