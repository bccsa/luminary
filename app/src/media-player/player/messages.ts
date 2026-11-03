/**
 * Every user-facing string this package can render lives here.
 *
 * Rule for the package: no string literal is ever written into the DOM outside
 * {@link DEFAULT_MESSAGES}. Implementing apps localize either by passing a
 * `messages` prop of resolved strings (any i18n framework, no coupling) or by
 * replacing whole surfaces through the `coming-soon` / `error` scoped slots.
 */
export interface PlayerMessages {
    // --- Status surfaces ---------------------------------------------------
    /** Shown while the master playlist has not been published yet. */
    comingSoon: string;

    // --- Errors ------------------------------------------------------------
    /** Fallback for any error code without a dedicated message. */
    errorGeneric: string;
    /** Engine cannot play munged content in this browser (e.g. iOS < 17.1). */
    errorUnsupportedBrowser: string;
    /** Encrypted content was loaded without a key. */
    errorKeyRequired: string;
    errorNetwork: string;
    errorMedia: string;
    retry: string;

    // --- Transport ---------------------------------------------------------
    play: string;
    pause: string;
    /** aria-label of the seek slider. */
    scrubberLabel: string;
    /** aria-label of the elapsed-time readout. */
    elapsedLabel: string;
    /**
     * aria-label of the readout at the far end of the scrubber, which shows the
     * whole length of the video rather than what is left of it.
     */
    durationLabel: string;
    /**
     * Skip-back button label. `{seconds}` is replaced with the configured
     * interval — the number must not be written into the string, or it reads
     * "15" on a player configured to move 10.
     */
    skipBack: string;
    /** Skip-forward button label. `{seconds}` is replaced as above. */
    skipForward: string;
    /**
     * Where the playhead is among the chapters, above the timeline. `{index}` is the chapter it is in and `{count}` how
     * many there are; a translation may move either.
     */
    chapterOf: string;

    // --- Fullscreen --------------------------------------------------------
    /**
     * Only the exit affordance is ours. Entering fullscreen is the host app's
     * to place and label — it belongs with that app's own playback controls,
     * not floating over the picture. Call `enterFullscreen()` on the player.
     */
    exitFullscreen: string;
    /** The now-playing screen's button that opens the picture full screen. */
    enterFullscreen: string;
    /** The now-playing screen's button that floats the picture over other apps. */
    pictureInPicture: string;
    /** The now-playing screen's button, and list, for the words of what plays. */
    lyrics: string;
    /** The menu that picks which subtitles the lyrics are, on the sound alone. */
    lyricsLanguage: string;
    /** The play button while the player gets ready. */
    loading: string;

    // --- Track menus -------------------------------------------------------
    audioMenuLabel: string;
    /** Name of the video quality setting: its button, its tooltip and its card's title. */
    qualityLabel: string;
    /** The quality card's row that lets the player choose. */
    qualityAuto: string;
    /** Name of the audio language setting, as above. */
    languageLabel: string;
    /** Name of the captions setting, as above. */
    captionsLabel: string;
    /** Names of the volume card's plus and minus buttons. */
    volumeUp: string;
    volumeDown: string;
    subtitlesMenuLabel: string;
    /** The "no subtitles" entry of the subtitles menu. */
    subtitlesOff: string;

    // --- Audio / video toggle ----------------------------------------------
    /**
     * The half of the top-right toggle that plays the picture. Labels an
     * action, not a state: pressing it is what returns to video.
     */
    videoModeLabel: string;
    /**
     * The half that plays sound only — no video data is downloaded at all, so
     * the wording is about bandwidth as much as about listening.
     */
    audioModeLabel: string;

    // --- Browse panel (fullscreen) -----------------------------------------
    /** Tab title, and heading of the chapter list. */
    chapters: string;
    /** Tab title of the list of videos on offer after this one. */
    upNext: string;
    /** Accessible name of the button that opens the panel, and of the panel itself. */
    browse: string;
    /** Accessible name of the panel's close button. */
    closeBrowse: string;

    // --- Up next card (fullscreen) -------------------------------------------
    /** Heading of the strip that offers the next videos near the end, and its accessible name. */
    nextUp: string;
    /** Accessible name of the strip's close button, which stops the automatic advance. */
    dismiss: string;

    // --- Fullscreen audio screen ---------------------------------------------
    /** Name of the playback speed button and its menu. */
    speedLabel: string;
    /** The word shown where the time left would be, for a live stream. */
    live: string;
    /** Name of the sleep timer button and its menu. */
    sleepTimer: string;
    /** The sleep timer menu's entry that turns it off. */
    sleepOff: string;
    /** A sleep timer entry; `{minutes}` is replaced with the number. */
    sleepMinutes: string;
    /** The sleep timer entry that stops playback when the chapter playing ends. */
    sleepEndOfChapter: string;
    /** What the sleep timer button says while one runs; `{minutes}` is the minutes left. */
    sleepLeft: string;
}

/** Built-in English strings. Merged under any partial the host supplies. */
export const DEFAULT_MESSAGES: PlayerMessages = {
    comingSoon: "Coming soon",

    errorGeneric: "This video could not be played.",
    errorUnsupportedBrowser:
        "This browser cannot play this video. Please update it or try another one.",
    errorKeyRequired: "This video is protected and no key was supplied.",
    errorNetwork: "The video could not be reached. Check your connection.",
    errorMedia: "Playback of this video failed.",
    retry: "Try again",

    play: "Play",
    pause: "Pause",
    scrubberLabel: "Seek",
    elapsedLabel: "Elapsed time",
    durationLabel: "Total time",
    skipBack: "Skip back {seconds} seconds",
    skipForward: "Skip forward {seconds} seconds",
    chapterOf: "Chapter {index} of {count}",

    exitFullscreen: "Exit full screen",
    enterFullscreen: "Full screen",
    pictureInPicture: "Picture in picture",
    lyrics: "Lyrics",
    lyricsLanguage: "Lyrics language",
    loading: "Loading",

    audioMenuLabel: "Audio",
    qualityLabel: "Quality",
    qualityAuto: "Auto",
    languageLabel: "Language",
    captionsLabel: "Captions",
    volumeUp: "Volume up",
    volumeDown: "Volume down",
    subtitlesMenuLabel: "Subtitles",
    subtitlesOff: "Off",

    videoModeLabel: "Play video",
    audioModeLabel: "Play audio only",

    chapters: "Chapters",
    upNext: "Up next",
    browse: "Chapters and up next",
    closeBrowse: "Close",

    nextUp: "Up next",
    dismiss: "Dismiss",

    speedLabel: "Speed",
    live: "Live",
    sleepTimer: "Sleep timer",
    sleepOff: "Off",
    sleepMinutes: "{minutes} minutes",
    sleepEndOfChapter: "End of chapter",
    sleepLeft: "{minutes} min left",
};

/**
 * Fills `{seconds}` in a message that carries a number.
 *
 * Deliberately not a template engine: one named placeholder is the whole
 * requirement, and a translator needs to know only that the token survives into
 * their wording — including moving, which languages that put the number last
 * require.
 */
export function formatSeconds(template: string, seconds: number): string {
    return template.replace("{seconds}", String(seconds));
}

/**
 * Merges a partial override map over {@link DEFAULT_MESSAGES}. `undefined`
 * entries fall back to the default so callers can spread sparse objects.
 */
export function mergeMessages(partial?: Partial<PlayerMessages>): PlayerMessages {
    if (!partial) return { ...DEFAULT_MESSAGES };
    const merged = { ...DEFAULT_MESSAGES };
    for (const key of Object.keys(DEFAULT_MESSAGES) as (keyof PlayerMessages)[]) {
        const value = partial[key];
        if (typeof value === "string") merged[key] = value;
    }
    return merged;
}
