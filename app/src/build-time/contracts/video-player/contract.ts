import type { Component } from "vue";
import type { PlayerControllerApi, PlayerState } from "@luminary-media-converter/player-web";

/** What the lock screen and the notification show for a video. */
export type VideoNowPlaying = {
    title: string;
    subtitle?: string;
    artworkUrl?: string;
};

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
    setMuted?(muted: boolean): void;
    startPictureInPicture?(): void;
    /** Opens the system's AirPlay device list. */
    showAirPlayPicker?(): void;
    play(): Promise<void> | undefined;
    pause(): void;
    seek(seconds: number): void;
    enterFullscreen(): Promise<void>;
    exitFullscreen(): Promise<void>;
};
