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
};

/** What a template ref to the player reaches. */
export type VideoPlayerHandle = {
    /** The player's controller; null for a YouTube link, which the embed plays on its own. */
    readonly controller?: PlayerControllerApi | null;
    readonly state?: Readonly<PlayerState>;
    play(): Promise<void> | undefined;
    pause(): void;
    seek(seconds: number): void;
    enterFullscreen(): Promise<void>;
    exitFullscreen(): Promise<void>;
};
