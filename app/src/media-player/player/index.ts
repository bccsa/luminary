// The app's full player UI, on the engine from `@luminary-media-converter/player-web`.
export { default as LuminaryPlayer } from "./components/LuminaryPlayer.vue";
export { default as AudioFullscreen } from "./components/AudioFullscreen.vue";
export type { ScrubPosition } from "./ui/audioFullscreen";
export { default as NowPlayingLyrics } from "./components/NowPlayingLyrics.vue";
export { activeLyric, cuesToLyrics, lyricText, type LyricCue } from "./ui/lyrics";
export { chapterMask } from "./ui/chapterBar";
export type { PlayerImage, PlayerImageInput } from "./image";
export { withSectionHeadings, type PlayerUpNextItem } from "./upNext";
export { DEFAULT_MESSAGES, formatSeconds, mergeMessages, type PlayerMessages } from "./messages";
export { DEFAULT_CONTROLS, mergeControls, type PlayerControlsOptions } from "./controls";
export { createKeepAlive, SILENT_AUDIO_DATA_URI, type KeepAlive } from "./ui/keepAlive";
export {
    SCRUB_EDGE_PX,
    SCRUB_SLOP_PX,
    clampPreviewCentre,
    formatClock,
    isOnBar,
    pointerRatio,
    previewTimes,
    rosterFineStep,
    rosterStep,
    rosterTiles,
    type RosterTile,
} from "./ui/scrubPreview";
export { default as ScrubThumbnail } from "./components/ScrubThumbnail.vue";
export { default as ScrubRoster } from "./components/ScrubRoster.vue";
export { default as ScrubPicture } from "./components/ScrubPicture.vue";
export { installAutoHide, AUTO_HIDE_MS, type ControlsStore } from "./ui/autoHide";
export {
    buildControlsHtml,
    type ControlsHtmlLabels,
    type ControlsHtmlOptions,
} from "./ui/controlsHtml";
