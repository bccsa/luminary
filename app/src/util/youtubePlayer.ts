import { reactive } from "vue";
import type { PlayerState } from "@luminary-media-converter/player-web";

/**
 * A video hosted by YouTube, driven from the page. The app's `/youtube-embed/` page runs YouTube's IFrame Player
 * API with its controls off and reports over `postMessage`; this turns those reports into the state the
 * media player already reads from any other player, and turns its buttons into commands back, so the
 * controls look and work the same on a YouTube video as on one of ours.
 */

/** YouTube's player states. */
const UNSTARTED = -1;
const ENDED = 0;
const PLAYING = 1;
const BUFFERING = 3;

/** What the hosted page says. */
export type YouTubeReport = {
    src: "lmc-yt";
    type: "ready" | "state" | "time" | "error" | "exit";
    status?: number;
    currentTime?: number;
    duration?: number;
    /** The loaded part of the video, 0 to 1. */
    loaded?: number;
    rate?: number;
    muted?: boolean;
    code?: number | string;
};

/** What the page asks of it. */
export type YouTubeCommand = {
    src: "lmc-yt";
    cmd: "play" | "pause" | "seek" | "rate" | "mute" | "unmute" | "snapshot" | "fullscreen";
    value?: number;
    /** With `fullscreen`: how far the notch or the corners keep things in from the edge, in px. */
    inset?: number;
};

export function isYouTubeReport(data: unknown): data is YouTubeReport {
    const report = data as Partial<YouTubeReport> | null;
    return !!report && report.src === "lmc-yt" && typeof report.type === "string";
}

/** What the viewer can be told of a player error; the codes are YouTube's. */
function errorMessage(code: number | string | undefined): string {
    switch (code) {
        case 100:
            return "This video was removed or is private.";
        case 101:
        case 150:
            return "The owner of this video does not allow it to be played here.";
        case 153:
            return "YouTube refused to play this video here.";
        case "script":
            return "YouTube's player could not be loaded.";
        default:
            return "This video could not be played.";
    }
}

export type YouTubePlayerOptions = {
    /** Sends a command to the hosted page. */
    send: (command: YouTubeCommand) => void;
    onTimeUpdate?: (currentTime: number, duration: number) => void;
    /** The length is known for the first time. */
    onLoadedMetadata?: () => void;
    onEnded?: () => void;
};

function initialState(): PlayerState {
    return {
        lifecycle: "loading",
        playing: false,
        ended: false,
        stalled: false,
        currentTime: 0,
        duration: 0,
        bufferedEnd: 0,
        playbackRate: 1,
        angles: [],
        activeAngleId: null,
        qualities: [],
        activeQualityId: "auto",
        audioTracks: [],
        activeAudioTrackId: null,
        subtitleTracks: [],
        activeSubtitleTrackId: null,
        chapterTracks: [],
        activeChapterTrackId: null,
        chapters: [],
        isAudioOnly: false,
        thumbnailsReady: false,
        error: null,
    };
}

export function createYouTubePlayer(options: YouTubePlayerOptions) {
    const state = reactive(initialState()) as PlayerState;
    const flags = reactive({ muted: false });
    let sawDuration = false;
    let endedReported = false;

    function receive(report: YouTubeReport): void {
        // "exit" asks the page to leave full-screen; it says nothing about the video.
        if (report.type === "exit") return;
        if (report.type === "error") {
            state.lifecycle = "error";
            state.playing = false;
            state.error = {
                code: "media",
                fatal: true,
                message: errorMessage(report.code),
            } as PlayerState["error"];
            return;
        }

        if (report.type === "ready" && state.lifecycle === "loading") state.lifecycle = "ready";
        if (state.lifecycle === "error") return;

        const status = report.status ?? UNSTARTED;
        if (report.type !== "time") {
            state.playing = status === PLAYING || status === BUFFERING;
            state.stalled = status === BUFFERING;
            state.ended = status === ENDED;
            if (status !== UNSTARTED && state.lifecycle === "loading") state.lifecycle = "ready";
        }

        if (report.currentTime !== undefined) state.currentTime = report.currentTime;
        if (report.duration !== undefined && report.duration > 0) {
            state.duration = report.duration;
            if (report.loaded !== undefined) state.bufferedEnd = report.loaded * report.duration;
            if (!sawDuration) {
                sawDuration = true;
                options.onLoadedMetadata?.();
            }
        }
        if (report.rate !== undefined) state.playbackRate = report.rate;
        if (report.muted !== undefined) flags.muted = report.muted;

        if (report.type === "time" || report.type === "state") {
            options.onTimeUpdate?.(state.currentTime, state.duration);
        }
        if (status === ENDED) {
            if (!endedReported) options.onEnded?.();
            endedReported = true;
        } else {
            endedReported = false;
        }
    }

    function command(cmd: YouTubeCommand["cmd"], value?: number): void {
        options.send({ src: "lmc-yt", cmd, ...(value === undefined ? {} : { value }) });
    }

    return {
        state,
        flags,
        receive,
        play: () => command("play"),
        pause: () => command("pause"),
        seek: (seconds: number) => {
            // The bar follows the finger at once; the report that comes back confirms it.
            state.currentTime = seconds;
            command("seek", seconds);
        },
        setPlaybackRate: (rate: number) => command("rate", rate),
        setMuted: (muted: boolean) => command(muted ? "mute" : "unmute"),
        /** Tells the page the frame went full-screen, or left it: it draws its own controls over the video. */
        setFullscreen: (on: boolean, inset = 0) =>
            options.send({ src: "lmc-yt", cmd: "fullscreen", value: on ? 1 : 0, inset }),
        /** Asks the page for the current state, for a player that attached late. */
        snapshot: () => command("snapshot"),
    };
}
