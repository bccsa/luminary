/**
 * Registers the Video.js 10 elements and icons the controls use, and nothing else.
 *
 * The obvious import, `@videojs/html/video/skin`, registers every element Video.js has, all its icons and the
 * packaged skin with its own template and stylesheet — about 550 kB (120 kB gzipped) added to an app, almost
 * none of it drawn here. Each element below is a module of its own, so an app's bundler takes only these.
 *
 * Every tag `controlsHtml.ts` and `LuminaryPlayer.vue` write must be named here: an unregistered one is just an
 * inert tag, which is how the skip buttons once came to do nothing. A test walks the live page for exactly that.
 */
import "@videojs/html/video/player";
import "@videojs/html/media/hlsjs-video";

import "@videojs/html/ui/container";
import "@videojs/html/ui/controls";
import "@videojs/html/ui/controls-backdrop";
import "@videojs/html/ui/controls-content";
import "@videojs/html/ui/gesture";

import "@videojs/html/ui/play-button";
import "@videojs/html/ui/seek-button";
import "@videojs/html/ui/mute-button";
import "@videojs/html/ui/fullscreen-button";
import "@videojs/html/ui/pip-button";
import "@videojs/html/ui/cast-button";
import "@videojs/html/ui/airplay-button";

import "@videojs/html/ui/time";
import "@videojs/html/ui/time-slider";
import "@videojs/html/ui/volume-slider";
import "@videojs/html/ui/volume-popover";
import "@videojs/html/ui/slider-track";
import "@videojs/html/ui/slider-fill";
import "@videojs/html/ui/slider-buffer";
import "@videojs/html/ui/slider-preview";
import "@videojs/html/ui/slider-value";

import "@videojs/html/ui/menu";
import "@videojs/html/ui/menu-content";
import "@videojs/html/ui/menu-radio-item";
import "@videojs/html/ui/menu-item-indicator";
import "@videojs/html/ui/quality-radio-group";
import "@videojs/html/ui/audio-track-radio-group";
import "@videojs/html/ui/playback-rate-radio-group";
import "@videojs/html/ui/captions-radio-group";

import { captionsOffIcon, captionsOnIcon } from "@videojs/html/icons/compat";
import {
    airPlayEnterIcon,
    airPlayExitIcon,
    checkIcon,
    castEnterIcon,
    castExitIcon,
    fullscreenEnterIcon,
    fullscreenExitIcon,
    pauseIcon,
    pipEnterIcon,
    pipExitIcon,
    playIcon,
    registerIcons,
    restartIcon,
    speedIcon,
    switchesIcon,
    volumeHighIcon,
    volumeLowIcon,
    volumeOffIcon,
} from "@videojs/html/icons";

/**
 * The language that is heard: headphones. The language glyph read as a text tool to people who had not met it, so
 * the sound's own sign stands for it.
 */
const AUDIO_LANGUAGE_PATHS =
    '<path d="M2.5 11.5V9a6.5 6.5 0 0 1 13 0v2.5"/><path d="M2.5 11.25A1.25 1.25 0 0 1 3.75 10H5v5H3.75a1.25 1.25 0 0 1-1.25-1.25z"/><path d="M15.5 11.25A1.25 1.25 0 0 0 14.25 10H13v5h1.25a1.25 1.25 0 0 0 1.25-1.25z"/>';
const LANGUAGE_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    AUDIO_LANGUAGE_PATHS +
    "</svg>";

/** Leaving full screen: an X, which people find where a corners glyph was missed. */
const CLOSE_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg>';

/** The icon names `controlsHtml.ts` writes as `<media-icon name="…">`. */
registerIcons("default", {
    "airplay-enter": airPlayEnterIcon,
    "airplay-exit": airPlayExitIcon,
    // "CC", as YouTube draws it: outlined while off, filled while a track is on.
    "captions-off": captionsOffIcon,
    "captions-on": captionsOnIcon,
    check: checkIcon,
    close: CLOSE_ICON,
    "cast-enter": castEnterIcon,
    "cast-exit": castExitIcon,
    "fullscreen-enter": fullscreenEnterIcon,
    "fullscreen-exit": fullscreenExitIcon,
    pause: pauseIcon,
    "pip-enter": pipEnterIcon,
    "pip-exit": pipExitIcon,
    play: playIcon,
    restart: restartIcon,
    language: LANGUAGE_ICON,
    speed: speedIcon,
    switches: switchesIcon,
    "volume-high": volumeHighIcon,
    "volume-low": volumeLowIcon,
    "volume-off": volumeOffIcon,
});
