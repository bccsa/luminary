/*
 * The stylesheet is pulled in from `LuminaryPlayer.vue`'s style block rather than from here, so that
 * no `.css` specifier reaches the emitted declarations.
 */
export * from '@luminary-media-converter/player-core';

export { default as LuminaryPlayer } from './components/LuminaryPlayer.vue';
export { default as AudioFullscreen } from './components/AudioFullscreen.vue';
export type { ScrubPosition } from './ui/audioFullscreen';
export { default as NowPlayingLyrics } from './components/NowPlayingLyrics.vue';
export { activeLyric, cuesToLyrics, lyricText, type LyricCue } from './ui/lyrics';
export { chapterMask } from './ui/chapterBar';

// What `poster` takes: an image described in plain terms, so the shape outlives the engine.
export type { PlayerImage, PlayerImageInput } from './image';

// What `upNext` takes: the videos offered after this one.
export { withSectionHeadings, type PlayerUpNextItem } from './upNext';

// The web's serving layer. `player-core` requires one and defaults to nothing, so a host building its
// own controller needs this — and a native shell implements `ServeStrategy` in its place.
export { BlobServeStrategy, type BlobServeStrategyOptions } from './serve/BlobServeStrategy';
export { LIVE_PLAYLIST_URI_PREFIX, isLivePlaylistUri, type LivePlaylistSource } from './serve/livePlaylistUri';

export {
    HlsJsVideoAdapter,
    UnsupportedBrowserError,
    isHlsEngineSupported,
    type HlsJsVideoAdapterOptions,
} from './adapter/HlsJsVideoAdapter';

// The hls.js request seam: one loader that answers `luminary://key` and `luminary://live/…`, and the
// load policy that stops a cold byte-range chunk being abandoned.
export { createLuminaryLoader, loadPolicyConfig, BYTE_RANGE_TTFB_MS, type LoaderState } from './adapter/hlsLoaders';
export { HlsStallSignals, type HlsStallSignalHooks } from './adapter/hlsStallSignals';
export { initialBandwidth, persistBandwidth, BANDWIDTH_STORAGE_KEY } from './adapter/hlsBandwidth';
export { monotonicNow } from './drivers/clock';

// The recovery ladder, whole. Exported because it IS the porting unit for a native adapter.
export {
    RecoveryLadder,
    type RecoveryLadderHooks,
    type RecoveryLadderOptions,
    type RecoveryReason,
} from './drivers/RecoveryLadder';

// The reference warming loop a native adapter is ported from; the adapter owns its own.
export { ChunkPrefetcher, type ChunkPrefetcherHooks, type ChunkPrefetcherOptions } from './adapter/chunkWarming';

export { DEFAULT_MESSAGES, formatSeconds, mergeMessages, type PlayerMessages } from './messages';
export { DEFAULT_CONTROLS, mergeControls, type PlayerControlsOptions } from './controls';
export { usePlayerState } from './composables/usePlayerState';
export { createKeepAlive, SILENT_AUDIO_DATA_URI, type KeepAlive } from './ui/keepAlive';
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
} from './ui/scrubPreview';
export { default as ScrubThumbnail } from './components/ScrubThumbnail.vue';
export { default as ScrubRoster } from './components/ScrubRoster.vue';
export { default as ScrubPicture } from './components/ScrubPicture.vue';
export { installAutoHide, AUTO_HIDE_MS, type ControlsStore } from './ui/autoHide';
export { buildControlsHtml, type ControlsHtmlLabels, type ControlsHtmlOptions } from './ui/controlsHtml';
export { isVideoJsElement } from './elements';
export { isYouTubeUrl, extractYouTubeId, toVideoJsYouTubeUrl } from './youtube';
export { singleFlight } from './singleFlight';
