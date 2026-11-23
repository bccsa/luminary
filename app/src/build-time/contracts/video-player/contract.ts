import type { Component } from "vue";
import type {
    Chapter,
    PlayerControllerApi,
    PlayerState,
} from "@luminary-media-converter/player-web";

/** A chapter as the page hands it to a player that plays downloads: one the download does not hold is not `available`. */
export type VideoChapter = Chapter & { available?: boolean };

/** What the lock screen and the notification show for a video. */
export type VideoNowPlaying = {
    title: string;
    subtitle?: string;
    artworkUrl?: string;
    /** Shown when the artwork is absent or does not load: the page's own stand-in for the post. */
    fallbackArtworkUrl?: string;
    /** The name a platform keeps the video's position under while the app is in the background. */
    progressKey?: string;
};

/** Where a video had got to while the app was in the background and the page could not save it. */
export type VideoBackgroundProgress = {
    /** The `progressKey` of the video. */
    key: string;
    /** Seconds; the duration when it played to the end. */
    position: number;
    duration: number;
    /** `Date.now()` time it was kept at. */
    savedAt: number;
    /** It played to the end of what was loaded; for a download, `position` and `duration` are already full-item time. */
    ended?: boolean;
};

/** The download tool on a platform's now-playing screen: the item's badge, and what the page knows of its sources. */
export type VideoNowPlayingDownload = {
    badge: "none" | "progress" | "downloaded" | "attention" | "unavailable";
    /** A whole number from 0 to 100, with `progress`. */
    percent?: number;
    /** Which copy plays now; absent while the item has no download. */
    source?: "downloaded" | "online";
    /** A chapter the download does not hold offers "Play online": the network is up and the item may be streamed. */
    canPlayOnline?: boolean;
    /** Dimmed, and a tap does nothing: nothing the sheet offers could be done now. */
    disabled?: boolean;
};

/** A one-line notice on a platform's now-playing screen, until the page replaces or clears it. */
export type VideoNowPlayingNotice = {
    /** Handed back with the `notice` and `noticeDismiss` download actions; a new id is a new notice. */
    id: string;
    text: string;
    /** The button's label; absent, the notice has no button. */
    action?: string;
    dismissible: boolean;
};

/** What a platform's own now-playing screen shows besides the player's state. */
export type VideoNowPlayingScreen = {
    title: string;
    subtitle?: string;
    /** The square cover drawn for sound. */
    artworkUrl?: string;
    /** The item's ThumbHash (base64), drawn as the screen's colour. */
    thumbHash?: string;
    canRead: boolean;
    canSwitch: boolean;
    audioMode: boolean;
    /** Room kept under the picture for subtitles. */
    captionBand: boolean;
    live?: boolean;
    /** The item's wide picture, shown in the picture's place until the item's first frame. */
    posterUrl?: string;
    /** Which item is on screen: another one starts on its poster. */
    itemId?: string;
    /** The page's sleep timer, for the screen's menu and badge; `minutes` is the length picked. */
    sleep?: { kind: "minutes"; endsAt: number; minutes: number } | { kind: "chapter" } | null;
    /** The tags up next can be narrowed to (chips show from two), and the one it is narrowed to. */
    upNextTags?: { id: string; title: string; series?: boolean }[];
    upNextTag?: string | null;
    /** The Data Saver level playback follows (Settings', or the quality menu's override), for the screen's menus. */
    dataSaver?: "off" | "light" | "strict";
    /** Whether the end counts down to the next item and plays it, for the gear menu and the end panel. */
    autoplay?: boolean;
    /** The download tool; absent or null leaves it out. A tap comes back as the `download` download action. */
    download?: VideoNowPlayingDownload | null;
    notice?: VideoNowPlayingNotice | null;
    /** Which items the end may count down to; absent, the screen shows no choice. */
    autoplayMode?: "all" | "downloaded";
    /**
     * The mode is forced (offline): it shows, and the choice is dimmed. Sent as an explicit boolean whenever
     * `autoplayMode` is.
     */
    autoplayModeLocked?: boolean;
};

/** The words of a platform's now-playing screen, in the page's language; any left out stay English. */
export type VideoNowPlayingTexts = Partial<
    Record<
        | "exitFullscreen"
        | "backToLine"
        | "speedLabel"
        | "sleepLabel"
        | "minimise"
        | "play"
        | "pause"
        | "loading"
        | "seek"
        | "skipBack"
        | "skipForward"
        | "previousChapter"
        | "nextChapter"
        | "audio"
        | "video"
        | "playAs"
        | "read"
        | "live"
        | "speed"
        | "quality"
        | "qualityAuto"
        | "audioMenu"
        | "subtitles"
        | "subtitlesOff"
        | "lyrics"
        | "sleepTimer"
        | "sleepOff"
        | "sleepMinutes"
        | "sleepEndOfChapter"
        | "sleepLeft"
        | "browse"
        | "chapters"
        | "more"
        | "closeBrowse"
        | "pictureInPicture"
        | "fullscreen"
        | "cast"
        | "replay"
        | "upNext"
        | "playNow"
        | "cancel"
        | "closeScrub"
        | "camera"
        | "exitFullscreen"
        | "allTags"
        | "noMoreWithTag"
        | "filterByTag"
        | "playbackSettings"
        | "dataSaver"
        | "dataSaverDefault"
        | "dataSaverOff"
        | "dataSaverLight"
        | "dataSaverStrict"
        | "autoplay"
        | "autoplayOn"
        | "autoplayOff"
        | "download"
        | "downloadProgress"
        | "downloaded"
        | "downloadAttention"
        | "downloadUnavailable"
        | "sourceDownloaded"
        | "sourceOnline"
        | "chapterNotDownloaded"
        | "chapterOnline"
        | "chapterDownload"
        | "autoplayMode"
        | "autoplayModeAll"
        | "autoplayModeDownloaded"
        | "closeNotice",
        string
    >
>;

/**
 * What the viewer asked a platform's now-playing screen for that only the page can do. `sleep` comes with a value:
 * `off`, `chapter`, or the minutes; `tag` with the tag up next is narrowed to, empty for all; `dataSaver` with
 * `off`, `light` or `strict`; `autoplay` with `on` or `off`.
 */
export type VideoNowPlayingAction =
    "minimise" | "read" | "audio" | "video" | "sleep" | "tag" | "dataSaver" | "autoplay";

/**
 * What the viewer did with a downloads control of a platform's now-playing screen, raised as `downloadaction` with
 * this one argument. `chapterOnline` and `chapterDownload` carry the index of a chapter in the `chapters` the page
 * passed; `autoplayMode` carries `all` or `downloaded`; `notice` and `noticeDismiss` carry the notice's id.
 */
export type VideoDownloadAction = {
    action:
        | "download"
        | "chapterOnline"
        | "chapterDownload"
        | "autoplayMode"
        | "notice"
        | "noticeDismiss";
    value?: string;
};

/** What a platform's own minimised player shows of the item, as the page's bar does. */
export type VideoMiniPlayerBar = {
    title: string;
    author?: string;
    /** The cover's address. */
    cover?: string;
    /** The item's ThumbHash (base64), drawn as the bar's colour, as the now-playing screen's. */
    thumbHash?: string;
    live: boolean;
    /** A rounded floating card rather than a bar along the screen's foot. */
    card: boolean;
    /** The progress line along the foot rather than the top. */
    lineAtFoot: boolean;
};

/** What the minimised player's buttons are called; one left out keeps the platform's English. */
export type VideoMiniPlayerTexts = Partial<
    Record<"expand" | "play" | "pause" | "close" | "loading", string>
>;

/** What the viewer did on a platform's own minimised player: it is already done there. */
export type VideoMiniPlayerAction = "expand" | "close";

/**
 * The player component a content page renders.
 *
 * Whichever it is, it takes the encoder's `LuminaryPlayer` props (`source`,
 * `preferredLanguage`, `controls`), emits `timeupdate`, `loadedmetadata` and
 * `ended`, and exposes {@link VideoPlayerHandle}, so the page drives either the
 * same way.
 */
export type VideoPlayerService = {
    component: Component;
    /**
     * Whether the component takes a `nowPlaying` prop. A player that does not would
     * otherwise render it as a stray attribute on its root element.
     */
    acceptsNowPlaying: boolean;
    /**
     * Whether the component takes an `inline` prop: draw the video in its own frame, in the page,
     * where the platform can. A player that does not would render it as a stray attribute.
     */
    acceptsInline?: boolean;
    /**
     * Whether the component takes an `upNext` prop and raises `upnextselect` with an item's id: it
     * lists them in a panel of its own. A player that does not would render the prop as a stray attribute.
     */
    acceptsBrowse?: boolean;
    /**
     * Whether the component takes a `nextUp` prop and raises `nextupselect` with its id: it offers the
     * next video near the end of fullscreen. A player that does not would render the prop as a stray attribute.
     */
    acceptsNextUp?: boolean;
    /**
     * What the platform kept of the playing video while the app was in the background, taken so it is applied
     * once; null when nothing was. A platform whose page saves on its own leaves it out.
     */
    takeBackgroundProgress?: () => Promise<VideoBackgroundProgress | null>;
    /**
     * Reactive: true once the component can play a `luminary://offline/` master. It then takes `chapters` items with
     * `available` and `upNext` items with `downloaded`, and raises `downloadaction` ({@link VideoDownloadAction}).
     * A player that does not is only ever given the online source.
     */
    playsDownloads?: boolean;
};

/** What a template ref to the player reaches. */
export type VideoPlayerHandle = {
    /** The player's controller; null for a YouTube link, which the embed plays on its own. */
    readonly controller?: PlayerControllerApi | null;
    readonly state?: Readonly<PlayerState>;
    /**
     * The platform draws the video inside the page, in the component's frame, behind a page that
     * leaves it transparent: nothing of the page may be opaque over it, and the poster is not needed.
     */
    readonly inlineActive?: boolean;
    /** The platform's player is muted. */
    readonly muted?: boolean;
    /** What the platform's player can do for controls the page draws; absent means nothing. */
    readonly canMute?: boolean;
    readonly canPictureInPicture?: boolean;
    /** AirPlay devices are around to send playback to; the page draws its control only then. */
    readonly airPlayAvailable?: boolean;
    /** Playback is going to an AirPlay video device; an AirPlay or Bluetooth audio route does not raise it. */
    readonly airPlayActive?: boolean;
    /**
     * A cast or AirPlay video device was chosen while a download plays, and the player kept playing the download; false
     * again when the route returns to the phone, the local load ends, or on iOS the sound alone starts playing (below).
     * A stream playing to a cast or AirPlay video device stays on the stream: more being ready is neither switched to
     * nor offered, with the picture or the sound alone (the device fetches the media itself and cannot reach the
     * phone's files, and a load from disk ends a cast).
     * A cast or AirPlay video device chosen while a download plays loads the online source at the same position when
     * online, with the picture or the sound alone, and tells the viewer casting is not available offline otherwise. A
     * Bluetooth or wired audio route is not such a device: it raises neither `airPlayActive` nor `castHeldLocal`, and a
     * download keeps playing through it, online or offline. An AirPlay route chosen while a download plays on iOS
     * follows the iOS rule below.
     *
     * On iOS a load from disk plays with external playback off, so an AirPlay route chosen during it carries the
     * phone's sound only, and no public signal tells an AirPlay speaker from an AirPlay video device. While the picture
     * plays, every AirPlay route counts as a device and raises `castHeldLocal`; while the sound alone plays (an
     * audio-only download, or the viewer turned the picture off), none does, since the route already plays the download
     * as it is. iOS tells the page only once it knows which: a load from disk whose tracks are not yet known raises
     * nothing, and a change between the picture and the sound alone tells the page again. Bluetooth and wired routes
     * never count.
     */
    readonly castHeldLocal?: boolean;
    /** A Chromecast or AirPlay device is around, found by the browser's player; the page draws its control only then. */
    readonly castAvailable?: boolean;
    /** Opens the browser player's device list (Chromecast or AirPlay). */
    showCastPicker?(): void;
    setMuted?(muted: boolean): void;
    /** The player's volume, 0 to 1, where the page can set it; a phone keeps its own. */
    readonly volume?: number;
    setVolume?(volume: number): void;
    /** The height of the picture playing now, in pixels, where the player knows it: what Auto quality has picked. */
    readonly playingHeight?: number;
    /** The bitrate of the sound playing now, in bits per second, with sound alone: what Auto quality has picked. */
    readonly playingBandwidth?: number;
    /** The words of the subtitles that are on, timed, where the player can read them; for lyrics with sound alone. */
    readonly subtitleCues?: readonly { start: number; end: number; text: string }[];
    startPictureInPicture?(): void;
    /** The moment a host's own strip of frames shows, so the player fetches its sprite sheets first; null when it goes. */
    focusThumbnails?(time: number | null): void;
    /** Opens the system's AirPlay device list. */
    showAirPlayPicker?(): void;
    play(): Promise<void> | undefined;
    pause(): void;
    /** `exact: false` may land on the nearest keyframe, which a player can show at once; for skips, not for scrubbing. */
    seek(seconds: number, options?: { exact?: boolean }): void;
    enterFullscreen(): Promise<void>;
    exitFullscreen(): Promise<void>;
    /**
     * The platform draws the phone's expanded now-playing screen itself, over the page; it raises
     * `nowplayingaction` ({@link VideoNowPlayingAction}) for what only the page can do.
     */
    readonly nativeNowPlaying?: boolean | null;
    /** Shows the platform's now-playing screen, or updates the one that is up. */
    showNowPlaying?(screen: VideoNowPlayingScreen, texts?: VideoNowPlayingTexts): void;
    hideNowPlaying?(): void;
    /**
     * The platform draws the minimised player itself, over the page, in the frame the page keeps for it; it raises
     * `miniplayeraction` ({@link VideoMiniPlayerAction}) for what the viewer did there.
     */
    readonly nativeMiniPlayer?: boolean | null;
    showMiniPlayer?(bar: VideoMiniPlayerBar, texts?: VideoMiniPlayerTexts): void;
    /** Where the page keeps room for it, in CSS pixels of the viewport; null takes it away for now. */
    setMiniPlayerFrame?(
        frame: { x: number; y: number; width: number; height: number } | null,
    ): void;
    hideMiniPlayer?(): void;
    /** The platform turns the picture off in place, the sound playing on: {@link setVideoOff} does something. */
    readonly canTurnVideoOff?: boolean;
    /** The picture off (its downloads stop) or back on, with nothing loaded again. */
    setVideoOff?(off: boolean): void;
};
