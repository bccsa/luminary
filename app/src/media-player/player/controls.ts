/**
 * What the fullscreen controls offer, and how far the skip buttons move.
 *
 * `player-web` is a published library, not one app's private UI. Outside
 * fullscreen the encoder draws its own audio selector beside the player, so the
 * one in here is redundant *for the encoder* — but a consumer app has no
 * selectors of its own, and for its viewers these controls are the whole
 * surface. Removing the menu outright would take language switching away from
 * every consumer to tidy one screen. So it is configurable, and the default is
 * what the library did before this option existed.
 *
 * The skip interval is configurable for the same reason: 10 s suits a lecture
 * and 30 s a sermon, and the consumer knows which it is shipping. Back and
 * forward are separate values because they are commonly asymmetric. The
 * defaults are 10 s, because this player matches the Luminary app's chrome
 * and that is what it ships.
 */
export interface PlayerControlsOptions {
    /**
     * Show the audio-track menu. Only ever visible when the stream carries more
     * than one track, whatever this says.
     */
    audioMenu: boolean;
    /**
     * Show the subtitles / captions menu.
     *
     * Only ever visible when the source carries text tracks, whatever this says
     * — the button hides itself while there are none. It is an option
     * regardless, because "invisible in today's content" is not the same promise
     * as "absent": an app that has never had this control does not want one
     * appearing the first time a stream ships a caption track.
     */
    subtitlesMenu: boolean;
    /**
     * Seconds the skip-back button moves. `0` removes the button, which is the
     * honest way to say "this player does not skip" — a button that moves
     * nowhere is worse than no button.
     *
     * Any interval is drawn: the interval is written into the button's icon.
     */
    skipBackSeconds: number;
    /** Seconds the skip-forward button moves. `0` removes the button. */
    skipForwardSeconds: number;
    /**
     * Show the controls while the player is windowed.
     *
     * `false` leaves the windowed frame bare, for a host that drives playback
     * from its own interface — the encoder, whose trim timeline and its
     * shortcuts are the whole transport:
     *
     * - no control bar, play button or dialog,
     *   so nothing on the frame can take focus or a key — a focused player
     *   control swallows every key but Tab, which would be the host's shortcuts;
     * - a click on the picture does nothing, and a double-click toggles
     *   fullscreen.
     *
     * Fullscreen shows every control regardless, because the host's interface
     * is out of view there. The coming-soon and error panels are states rather
     * than controls and show either way, as do subtitles, which are the
     * picture's.
     */
    windowedControls: boolean;
    /**
     * Hold the timeline to open the roster: a strip of frames around the playhead. Slow drags show
     * fine-grained frames and fast drags coarse ones. `false` keeps the single hover/drag thumbnail.
     */
    scrubRoster: boolean;
    /**
     * While the timeline is held, draw the frame being scrubbed over the picture, so a drag reads as a
     * fast-forward. Costs nothing beyond moving a background offset: the sprite is already loaded.
     */
    scrubPicture: boolean;
}

/** The behaviour the library had before any of this was configurable. */
export const DEFAULT_CONTROLS: PlayerControlsOptions = {
    audioMenu: true,
    subtitlesMenu: true,
    skipBackSeconds: 10,
    skipForwardSeconds: 10,
    windowedControls: true,
    scrubRoster: true,
    scrubPicture: true,
};

/**
 * Merges a partial override map over {@link DEFAULT_CONTROLS}.
 *
 * Sparse is the point: a host that only wants to drop the audio menu says that
 * and inherits every other default, so adding an option here later cannot
 * change what an existing caller already gets.
 *
 * A negative or non-finite interval is treated as absent rather than honoured —
 * `NaN` would travel into `seek()` and strand the video, and seeking backwards
 * from the forward button is not a configuration anyone means.
 */
export function mergeControls(partial?: Partial<PlayerControlsOptions>): PlayerControlsOptions {
    const merged = { ...DEFAULT_CONTROLS };
    if (!partial) return merged;

    for (const key of [
        "audioMenu",
        "subtitlesMenu",
        "windowedControls",
        "scrubRoster",
        "scrubPicture",
    ] as const) {
        const value = partial[key];
        if (typeof value === "boolean") {
            merged[key] = value;
        }
    }
    for (const key of ["skipBackSeconds", "skipForwardSeconds"] as const) {
        const value = partial[key];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
            merged[key] = value;
        }
    }
    return merged;
}
