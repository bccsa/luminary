import type { Component } from "vue";
import type { PlayerControllerApi, PlayerState } from "@luminary-media-converter/player-web";

/** What the lock screen and the notification show for a video. */
export type VideoNowPlaying = {
    title: string;
    subtitle?: string;
    artworkUrl?: string;
    /** Shown when the artwork is absent or does not load: the page's own stand-in for the post. */
    fallbackArtworkUrl?: string;
};

/** What a platform's own now-playing screen shows besides the player's state. */
export type VideoNowPlayingScreen = {
    title: string;
    subtitle?: string;
    /** The square cover drawn for sound. */
    artworkUrl?: string;
    /** A small soft image (a `data:` PNG) stretched over the background. */
    washUrl?: string;
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
};

/** The words of a platform's now-playing screen, in the page's language; any left out stay English. */
export type VideoNowPlayingTexts = Partial<
    Record<
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
        | "exitFullscreen"
        | "allTags"
        | "noMoreWithTag"
        | "filterByTag",
        string
    >
>;

/**
 * What the viewer asked a platform's now-playing screen for that only the page can do. `sleep` comes with a value:
 * `off`, `chapter`, or the minutes; `tag` with the tag up next is narrowed to, empty for all.
 */
export type VideoNowPlayingAction = "minimise" | "read" | "audio" | "video" | "sleep" | "tag";

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
    /** Playback is going to an AirPlay device. */
    readonly airPlayActive?: boolean;
    /** A Chromecast or AirPlay device is around, found by the browser's player; the page draws its control only then. */
    readonly castAvailable?: boolean;
    /** Opens the browser player's device list (Chromecast or AirPlay). */
    showCastPicker?(): void;
    setMuted?(muted: boolean): void;
    /** The player's volume, 0 to 1, where the page can set it; a phone keeps its own. */
    readonly volume?: number;
    setVolume?(volume: number): void;
    /** The words of the subtitles that are on, timed, where the player can read them; for lyrics with sound alone. */
    readonly subtitleCues?: readonly { start: number; end: number; text: string }[];
    startPictureInPicture?(): void;
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
    /** The platform turns the picture off in place, the sound playing on: {@link setVideoOff} does something. */
    readonly canTurnVideoOff?: boolean;
    /** The picture off (its downloads stop) or back on, with nothing loaded again. */
    setVideoOff?(off: boolean): void;
};
