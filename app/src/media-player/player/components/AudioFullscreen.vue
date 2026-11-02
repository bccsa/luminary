<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useSlots, watch } from "vue";
import type {
    Chapter,
    SleepTimerOption,
    SleepTimerState,
    ThumbnailSpriteCue,
} from "@luminary-media-converter/player-web";
import { formatSeconds, type PlayerMessages } from "../messages";
import type { PlayerUpNextItem } from "../upNext";
import BrowsePanel from "./BrowsePanel.vue";
import NowPlayingLyrics from "./NowPlayingLyrics.vue";
import { activeLyric, type LyricCue } from "../ui/lyrics";
import { skipIcon } from "../ui/controlsHtml";
import type { ScrubPosition } from "../ui/audioFullscreen";
import { formatChapterOf } from "../ui/chapterBar";
import { TimelineScrub } from "../ui/timelineScrub";
import {
    SLEEP_MINUTES,
    SPEED_OPTIONS,
    formatMinutes,
    sleepMinutesLeft,
} from "../ui/audioFullscreen";

/**
 * The screen fullscreen becomes when only sound is playing: a now-playing screen, not a picture with controls.
 *
 * The picture leads, then what is playing and which chapter, the timeline, the transport, and the few controls a
 * listener of speech uses: speed, language, a sleep timer, casting and the chapters. Wide, the chapters are a list
 * that follows the audio beside the picture; narrow, a chip opens them. The seek bar is cut at the chapters when
 * wide and plain when narrow.
 *
 * In `dark` the screen is plain with a glow behind the picture; in `light` it takes the picture's colour over the
 * whole screen. Both are the picture itself, blurred, so no colour has to be read from it.
 *
 * It draws everything from what it is given and says what is asked through events, so it does not care which player
 * is under it: the web player's, or the app's over a native one. Only casting is the host's own, in the `cast` slot.
 *
 * A host can also make it its now-playing view for video: with `stage: 'video'` the picture's place is the host's
 * `stage` slot, full width, and the tools are a video's (subtitles, picture in picture, full screen) instead of a
 * listener's. `stageHole` leaves that place transparent, for a picture the platform draws behind the page. The
 * `top-end` slot fills the right of the top line (a switch between sound and picture, say).
 */
const props = defineProps<{
    title: string;
    /** The series or collection it belongs to, small, above the title. */
    eyebrow?: string;
    /** Who it is by. */
    subtitle?: string;
    /** `fallback` is shown in its place if the picture does not load. */
    artwork: { src?: string; srcset?: string; sizes?: string; fallback?: string } | null;
    appearance: "light" | "dark";
    chapters: readonly Chapter[];
    currentTime: number;
    duration: number;
    bufferedEnd?: number;
    playing: boolean;
    /** Loading or stuck: the play button turns while the player gets ready, as a video's spinner does. */
    busy?: boolean;
    /** A live stream: nothing to skip and no time left to show. */
    live?: boolean;
    /** The chapter the playhead is in; -1 for none. */
    chapterIndex: number;
    playbackRate: number;
    /** The video's renditions, for the quality menu; none or one and the menu is not offered. */
    qualities?: readonly { id: string; label: string }[];
    /** The rendition held, or `auto` while the player chooses. */
    activeQualityId?: string;
    audioTracks: readonly { id: string; label: string }[];
    activeAudioTrackId: string | null;
    sleepTimer: SleepTimerState | null;
    hasBrowse: boolean;
    skipBackSeconds: number;
    skipForwardSeconds: number;
    /** Mask that cuts the timeline at the chapters; empty for one plain bar. */
    chapterMask: string;
    messages: PlayerMessages;
    /** Videos that may follow, for the panel's Up next tab. */
    upNext?: readonly PlayerUpNextItem[];
    /** Open the panel for chapters and up next on this screen, instead of asking the host (`open-browse`) to show them. */
    chaptersSheet?: boolean;
    /** What takes the picture's place: the cover, or the host's picture (`stage` slot) at full width. */
    stage?: "cover" | "video";
    /**
     * The picture takes the whole screen and nothing else shows: a browser turned sideways, which cannot go full
     * screen without a tap, has the host's player and its own controls fill the window instead.
     */
    fill?: boolean;
    /** The picture's width over its height, so its place takes the picture's shape; 16:9 when not known. */
    stageAspect?: number;
    /** Room under the picture for the host's subtitles. */
    captionBand?: boolean;
    /** The words being said now, under the picture, where the host shows subtitles itself. */
    caption?: string;
    /** The host draws the picture behind the page, where the stage is: nothing of the screen may cover it there. */
    stageHole?: boolean;
    /** The screen's colour in place of the cover blurred: a small picture (a ThumbHash) that is soft once stretched. */
    wash?: string;
    /** The chevron's name, where it minimises the player rather than leaving full screen. */
    exitLabel?: string;
    subtitleTracks?: readonly { id: string; label: string }[];
    activeSubtitleTrackId?: string | null;
    canPictureInPicture?: boolean;
    /** Offers full screen with sound alone too, among the tools, for a host that has a full screen to take it to. */
    fullscreenTool?: boolean;
    /** The host's full screen is open: it is left by an X where a video's full screen has its own, top right. */
    fullscreenActive?: boolean;
    /** The words of what plays, timed: offered, with sound alone, as lyrics in the picture's place. */
    lyrics?: readonly LyricCue[];
    /** The preview frame at a time, once the thumbnails are in: the chapters' pictures. */
    thumbnailAt?: (seconds: number) => ThumbnailSpriteCue | null;
}>();

const emit = defineEmits<{
    exit: [];
    /** A menu or the chapters panel is over the screen, or is not any more. */
    covered: [open: boolean];
    "toggle-play": [];
    seek: [time: number];
    "open-browse": [];
    "seek-chapter": [chapter: Chapter];
    upnextselect: [id: string];
    rate: [rate: number];
    "audio-track": [id: string];
    quality: [id: string];
    sleep: [option: SleepTimerOption | null];
    "subtitle-track": [id: string | null];
    "picture-in-picture": [];
    fullscreen: [];
    /** The stage moved or changed size: a picture drawn behind the page has to be placed again. */
    stagechange: [];
    /** The bar is held: where, for a host that shows frames in the `roster` slot. Null when it is let go. */
    scrub: [position: ScrubPosition | null];
}>();

const slots = useSlots();
const isVideo = computed(() => props.stage === "video");
/** Picture in picture and full screen, whichever apply, beside the line above the seek bar. */
const pictureTools = computed(
    () =>
        (isVideo.value && !!props.canPictureInPicture) ||
        ((isVideo.value || !!props.fullscreenTool) && !props.fullscreenActive),
);
const subtitleTracks = computed(() => props.subtitleTracks ?? []);
const lyricLines = computed(() => props.lyrics ?? []);

// With sound alone the subtitles are the lyrics: they show while a language is on, and "off" puts them away.
const lyricsOn = computed(
    () => !isVideo.value && !!props.activeSubtitleTrackId && lyricLines.value.length > 0,
);
// The cover stays in view: the line being said sits under it, and the scrolling lyrics take its place only when asked for.
const lyricsExpanded = ref(false);
const showLyrics = computed(() => lyricsOn.value && lyricsExpanded.value);
const cueLine = computed(
    () => lyricLines.value[activeLyric(lyricLines.value, props.currentTime)]?.text ?? "",
);
// In the cover's place, in a window of any shape, as on a phone.
const lyricsInStage = showLyrics;

type MenuId = "speed" | "language" | "sleep" | "subtitles" | "quality";
const menu = ref<MenuId | null>(null);
const rootEl = ref<HTMLElement | null>(null);

const MENU_GAP = 12;

/**
 * Keeps an open menu on the screen: no taller than the room above its button, scrolling inside if it is longer,
 * and no further out than the screen's edges. The menu sits over its button centred, which in a short, wide view
 * puts it past the edge or the top.
 */
function placeMenu(): void {
    const root = rootEl.value;
    const menuEl = root?.querySelector<HTMLElement>("[role=menu]");
    const tool = menuEl?.parentElement;
    if (!root || !menuEl || !tool) return;
    const bounds = root.getBoundingClientRect();
    const room = tool.getBoundingClientRect().top - bounds.top - MENU_GAP - 8;
    menuEl.style.maxHeight = `${Math.max(120, room)}px`;
    menuEl.style.translate = "0 0";
    const rect = menuEl.getBoundingClientRect();
    const over = rect.right - (bounds.right - MENU_GAP);
    const under = bounds.left + MENU_GAP - rect.left;
    const shift = over > 0 ? -over : under > 0 ? under : 0;
    menuEl.style.translate = `${shift}px 0`;
}

watch(menu, async (id) => {
    if (!id) return;
    await nextTick();
    placeMenu();
});

function toggleMenu(id: MenuId): void {
    menu.value = menu.value === id ? null : id;
}

/** A pick closes the menu; so does Escape, and a press anywhere outside it. */
function closeMenu(): void {
    menu.value = null;
}
function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && menu.value) {
        event.stopPropagation();
        closeMenu();
    }
}
/** A tap leaves the button focused on a touch screen; only a keyboard's focus is worth keeping. */
function onClick(event: MouseEvent): void {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (button && !button.matches(":focus-visible")) button.blur();
}
function onPointerdown(event: PointerEvent): void {
    if (
        menu.value &&
        !(event.target instanceof Element && event.target.closest("[data-afs-tools]"))
    )
        closeMenu();
}

// The bar follows the finger while it is held and asks for the seek once, when it is let go.
const dragTime = ref<number | null>(null);
/**
 * Where a seek was asked for, held until the player reports a time near it: the player's time lags the seek, and
 * the bar would flick back to where it was before going where it was let go.
 */
const seekTarget = ref<number | null>(null);
let seekHold: ReturnType<typeof setTimeout> | undefined;
function holdSeek(time: number): void {
    seekTarget.value = time;
    clearTimeout(seekHold);
    seekHold = setTimeout(() => (seekTarget.value = null), SEEK_HOLD_MS);
}
/** Long enough for a slow seek to land; a seek the player never makes lets the bar go back after it. */
const SEEK_HOLD_MS = 2000;
watch(
    () => props.currentTime,
    (time) => {
        if (seekTarget.value !== null && Math.abs(time - seekTarget.value) < 1.5) {
            seekTarget.value = null;
            clearTimeout(seekHold);
        }
    },
);
onBeforeUnmount(() => clearTimeout(seekHold));
const barEl = ref<HTMLElement | null>(null);
const shownTime = computed(() => dragTime.value ?? seekTarget.value ?? props.currentTime);
const knownDuration = computed(() =>
    Number.isFinite(props.duration) && props.duration > 0 ? props.duration : 0,
);
const isLive = computed(() => props.live === true || props.duration === Infinity);
const pct = (seconds: number): string =>
    `${knownDuration.value ? Math.min(100, Math.max(0, (seconds / knownDuration.value) * 100)) : 0}%`;
function timeAt(clientX: number): number {
    const rect = barEl.value?.getBoundingClientRect();
    if (!rect || !rect.width) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * knownDuration.value;
}
// Measured on each move, not once: a turn of the phone moves the bar mid-drag.
function announceScrub(time: number, held = false): void {
    const bar = barEl.value?.getBoundingClientRect();
    const root = rootEl.value?.getBoundingClientRect();
    if (!bar || !root || !knownDuration.value) return;
    const markerX =
        bar.left - root.left + Math.min(1, Math.max(0, time / knownDuration.value)) * bar.width;
    emit("scrub", {
        time,
        markerX,
        width: root.width,
        bottom: root.bottom - bar.top + 8,
        ...(held && { held }),
    });
}
/**
 * A finger on the bar does not seek where it lands: a tap opens it for scrubbing and holds the sound; only a drag
 * moves it. With frames, opening shows the host's strip of them (the `scrub` event, as a drag does); without, the bar
 * thickens and carries a handle. It closes on a tap elsewhere, on play, or five seconds after the last touch, as the
 * video players' timelines do. A mouse still seeks on a click.
 */
const scrubOpen = ref(false);
/** Opened with frames: the host's strip is up, at the playhead or where a drag let go. */
const stripOpen = ref(false);
const timelineScrub = new TimelineScrub((effect) => {
    switch (effect.kind) {
        case "open":
            if (effect.mode === "strip") {
                stripOpen.value = true;
                announceScrub(shownTime.value, true);
            } else {
                scrubOpen.value = true;
            }
            break;
        case "close":
            scrubOpen.value = false;
            if (stripOpen.value) emit("scrub", null);
            stripOpen.value = false;
            break;
        case "pause":
            if (props.playing) emit("toggle-play");
            break;
        case "play":
            if (!props.playing) emit("toggle-play");
            break;
        case "seek":
            holdSeek(effect.time);
            emit("seek", effect.time);
            break;
    }
});
onBeforeUnmount(() => timelineScrub.reset());

/** How far a finger travels along the bar before a tap becomes a drag. */
const TOUCH_DRAG_SLOP_PX = 8;
/** A finger that came down on the bar, until it lifts. */
let touchPress: { id: number; x: number; dragging: boolean } | null = null;

function isTouch(event: PointerEvent): boolean {
    return event.pointerType === "touch" || event.pointerType === "pen";
}

/** Whether there are frames for a host to show while the bar is scrubbed. */
function framesReady(): boolean {
    return knownDuration.value > 0 && !!props.thumbnailAt?.(0);
}

/**
 * A press anywhere but the bar and the host's strip closes it, and play closes it and plays. A finger on the strip,
 * which the host drags itself, keeps it open until five seconds after it lifts.
 */
function onRootDown(event: PointerEvent): void {
    if (!timelineScrub.isOpen || !(event.target instanceof Element)) return;
    if (event.target.closest(".lmpl-afs-roster-slot")) return timelineScrub.touchBegan();
    if (event.target.closest(".lmpl-afs-bar, .lmpl-afs-scrubzone")) return;
    if (event.target.closest(".lmpl-afs-playbtn")) return;
    timelineScrub.tappedElsewhere();
}

function onRootUp(event: PointerEvent): void {
    if (
        timelineScrub.isOpen &&
        event.target instanceof Element &&
        event.target.closest(".lmpl-afs-roster-slot")
    ) {
        timelineScrub.dragCancelled();
    }
}

function onPlayButton(): void {
    if (timelineScrub.isOpen) timelineScrub.playPressed();
    else emit("toggle-play");
}

function onBarDown(event: PointerEvent): void {
    if (!knownDuration.value) return;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    if (isTouch(event)) {
        touchPress = { id: event.pointerId, x: event.clientX, dragging: false };
        timelineScrub.touchBegan();
        return;
    }
    dragTime.value = timeAt(event.clientX);
    announceScrub(dragTime.value);
}
function onBarMove(event: PointerEvent): void {
    if (touchPress && event.pointerId === touchPress.id) {
        if (!touchPress.dragging && Math.abs(event.clientX - touchPress.x) > TOUCH_DRAG_SLOP_PX) {
            touchPress.dragging = true;
            timelineScrub.dragBegan(framesReady(), props.playing);
        }
        if (!touchPress.dragging) return;
    }
    if (dragTime.value === null && !touchPress?.dragging) return;
    dragTime.value = timeAt(event.clientX);
    announceScrub(dragTime.value, !!touchPress);
}
function onBarUp(event?: PointerEvent): void {
    const press = touchPress;
    if (press && event && event.pointerId === press.id) {
        touchPress = null;
        if (!press.dragging) {
            if (event.type === "pointerup") timelineScrub.tapped(framesReady(), props.playing);
            return;
        }
        const time = dragTime.value;
        dragTime.value = null;
        // The strip stays up where the finger let go; the thick bar has none to keep.
        if (stripOpen.value && time !== null) announceScrub(time, true);
        else emit("scrub", null);
        if (event.type === "pointerup" && time !== null) timelineScrub.dragEnded(time);
        else timelineScrub.dragCancelled();
        return;
    }
    if (dragTime.value === null) return;
    holdSeek(dragTime.value);
    emit("seek", dragTime.value);
    dragTime.value = null;
    emit("scrub", null);
}
function onBarKey(event: KeyboardEvent): void {
    const step =
        event.key === "ArrowLeft" || event.key === "ArrowDown"
            ? -5
            : event.key === "ArrowRight" || event.key === "ArrowUp"
              ? 5
              : 0;
    if (!step || !knownDuration.value) return;
    event.preventDefault();
    seekTo(Math.min(knownDuration.value, Math.max(0, shownTime.value + step)));
}
function seekTo(time: number): void {
    holdSeek(time);
    emit("seek", time);
}
// From where the bar shows, so presses in a row add up before the player has caught up with the first.
const skip = (seconds: number): void =>
    seekTo(Math.min(knownDuration.value || Infinity, Math.max(0, shownTime.value + seconds)));

const browseOpen = ref(false);
watch([menu, browseOpen], ([open, panel]) => emit("covered", open !== null || panel));
const uid = `lmpl-afs-${Math.random().toString(36).slice(2, 9)}`;
/** The tab the panel opens on; the host's default when none is asked for. */
const browseTab = ref<"chapters" | "upnext" | undefined>(undefined);
function openChapters(tab?: "chapters"): void {
    browseTab.value = tab;
    if (props.chaptersSheet) {
        menu.value = null;
        browseOpen.value = true;
    } else {
        emit("open-browse");
    }
}
function pickChapter(chapter: Chapter): void {
    emit("seek-chapter", chapter);
    browseOpen.value = false;
}
function pickUpNext(id: string): void {
    emit("upnextselect", id);
    browseOpen.value = false;
}

/**
 * `m:ss`, or `h:mm:ss` for every time once `guide` (the length) reaches an hour, and minutes padded
 * from ten of them: all the times of one video read in one shape, so the bar between them never moves.
 */
function clock(seconds: number, guide = 0): string {
    const whole = Math.max(0, Math.floor(seconds));
    const guideWhole = Math.max(0, Math.floor(guide));
    const h = Math.floor(whole / 3600);
    const m = Math.floor((whole % 3600) / 60);
    const s = String(whole % 60).padStart(2, "0");
    if (h > 0 || guideWhole >= 3600) return `${h}:${String(m).padStart(2, "0")}:${s}`;
    const minutes = Math.floor(whole / 60);
    return `${guideWhole >= 600 ? String(minutes).padStart(2, "0") : minutes}:${s}`;
}
/** The length the times are read against: the video's, or the position if it has run past it. */
const timeGuide = computed(() => Math.max(knownDuration.value, shownTime.value));
/** Wide enough for the longest time and a minus, so a label never changes the bar's length. */
const timeWidth = computed(() => `${clock(timeGuide.value, timeGuide.value).length + 1}ch`);

// The sleep timer's button says how long is left; it is looked at every half minute, which is as fine as it reads.
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;
watch(
    () => props.sleepTimer?.kind === "minutes",
    (running) => {
        clearInterval(ticker);
        ticker = undefined;
        if (running) {
            now.value = Date.now();
            ticker = setInterval(() => (now.value = Date.now()), 30_000);
        }
    },
    { immediate: true },
);
onBeforeUnmount(() => clearInterval(ticker));

const sleepCaption = computed(() => {
    const left = sleepMinutesLeft(props.sleepTimer, now.value);
    if (left !== null) return formatMinutes(props.messages.sleepLeft, left);
    return props.sleepTimer?.kind === "chapter" ? props.messages.sleepEndOfChapter : "";
});

function chooseSleep(option: SleepTimerOption | null): void {
    emit("sleep", option);
    closeMenu();
}
function chooseRate(rate: number): void {
    emit("rate", rate);
    closeMenu();
}
function chooseQuality(id: string): void {
    emit("quality", id);
    closeMenu();
}
function chooseTrack(id: string): void {
    emit("audio-track", id);
    closeMenu();
}
function chooseSubtitles(id: string | null): void {
    emit("subtitle-track", id);
    closeMenu();
}

// The stage's band, for a picture drawn behind the page: the screen's colour is cut out there (see .lmpl-afs-hole).
const stageEl = ref<HTMLElement | null>(null);
const holeTop = ref(0);
const holeBottom = ref(0);
/** The foot of the picture's place (cover or video, with its subtitles band): the chapters sheet comes up to it. */
const artBottom = ref(0);
function measureHole(): void {
    const root = rootEl.value;
    const stageBox = stageEl.value;
    if (!root || !stageBox) return;
    const box = stageBox.getBoundingClientRect();
    const top = box.top - root.getBoundingClientRect().top;
    artBottom.value = Math.round(top + box.height);
    // The room for subtitles under the picture is the page's, not part of the picture's hole. The exact height, not
    // offsetHeight's whole pixels: a hole that stops short leaves a sliver of the screen inside the stage, out of its
    // shadow, as a light line under the picture.
    const bottom = top + box.height - (isVideo.value && props.captionBand ? 64 : 0);
    if (top === holeTop.value && bottom === holeBottom.value) return;
    holeTop.value = top;
    holeBottom.value = bottom;
    emit("stagechange");
}
/**
 * The stage moves without changing size whenever something around it does (the title wrapping, the top line
 * filling in): portrait spreads the parts evenly. Every part is watched, since a move alone reports nothing.
 */
let holeObserver: ResizeObserver | null = null;
onMounted(() => {
    if (typeof ResizeObserver === "undefined") return;
    holeObserver = new ResizeObserver(measureHole);
    const root = rootEl.value;
    if (!root) return;
    holeObserver.observe(root);
    for (const part of root.querySelectorAll(
        ":scope > .lmpl-afs-top, :scope > .lmpl-afs-main, :scope > .lmpl-afs-main > *",
    )) {
        holeObserver.observe(part);
    }
    // The picture sits in a group of its own, so its own changes (its shape, once the video's is known) are watched too.
    if (stageEl.value) holeObserver.observe(stageEl.value);
});
watch([isVideo, () => props.stageHole], async () => {
    await nextTick();
    measureHole();
});
onBeforeUnmount(() => holeObserver?.disconnect());

const speedText = (rate: number): string => `${Number.isInteger(rate) ? rate : rate}×`;
const artworkSizes = computed(() => props.artwork?.sizes ?? "(min-aspect-ratio: 6/5) 40vh, 80vw");

// A picture that does not load gives way to its fallback, and to the placeholder when there is none.
const coverFailed = ref(false);
watch(
    () => props.artwork?.src,
    () => (coverFailed.value = false),
);
const cover = computed(() => {
    const art = props.artwork;
    if (!art) return null;
    if (!coverFailed.value) return art;
    return art.fallback ? { src: art.fallback } : null;
});
const washSrc = computed(() => props.wash || cover.value?.src);
</script>

<template>
    <div
        ref="rootEl"
        @pointerdown.capture="onRootDown"
        @pointerup.capture="onRootUp"
        @pointercancel.capture="onRootUp"
        class="lmpl-afs"
        :class="[
            `lmpl-afs-${appearance}`,
            {
                'lmpl-afs-video': isVideo,
                'lmpl-afs-fill': fill && isVideo,
                'lmpl-afs-hole': isVideo && stageHole,
                'lmpl-afs-captions': isVideo && captionBand,
                'lmpl-afs-fullscreen-open': fullscreenActive,
            },
        ]"
        :style="{
            '--lmpl-chapter-mask': chapterMask || undefined,
            '--lmpl-hole-top': `${holeTop}px`,
            '--lmpl-hole-bottom': `${holeBottom}px`,
            '--lmpl-art-bottom': artBottom ? `${artBottom}px` : undefined,
            '--lmpl-stage-ar': stageAspect && stageAspect > 0 ? String(stageAspect) : undefined,
        }"
        data-test="audioFullscreen"
        @keydown="onKeydown"
        @pointerdown="onPointerdown"
        @click="onClick"
    >
        <!-- The picture, blurred, as the screen's colour: lighter in `light`, darker in `dark`. -->
        <div
            class="lmpl-afs-bg"
            :class="{ 'lmpl-afs-bg-hash': wash }"
            aria-hidden="true"
        >
            <img
                v-if="washSrc"
                class="lmpl-afs-wash"
                :class="{ 'lmpl-afs-wash-hash': wash }"
                :src="washSrc"
                alt=""
                draggable="false"
                data-test="afsWash"
            />
        </div>

        <!-- A picture drawn behind the page: the wash is cut out where the picture is, and is the sound's everywhere else. -->
        <div
            v-if="isVideo && stageHole && washSrc"
            class="lmpl-afs-bg lmpl-afs-bg-low"
            :class="{ 'lmpl-afs-bg-hash': wash }"
            aria-hidden="true"
        >
            <img
                class="lmpl-afs-wash"
                :class="{ 'lmpl-afs-wash-hash': wash }"
                :src="washSrc"
                alt=""
                draggable="false"
            />
        </div>

        <div class="lmpl-afs-roster-slot"><slot name="roster"></slot></div>

        <div class="lmpl-afs-top">
            <button
                type="button"
                class="lmpl-afs-iconbtn"
                :aria-label="exitLabel || messages.exitFullscreen"
                data-test="afsExit"
                @click="emit('exit')"
            >
                <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </button>
            <span class="lmpl-afs-eyebrow">{{ eyebrow }}</span>
            <div
                v-if="slots['top-end'] || fullscreenActive"
                class="lmpl-afs-topend"
                data-test="afsTopEnd"
            >
                <slot name="top-end"></slot>
                <!-- Last in the line, at the screen's corner: where a video's full screen has its own X. -->
                <button
                    v-if="fullscreenActive"
                    type="button"
                    class="lmpl-afs-iconbtn lmpl-afs-close"
                    :aria-label="messages.exitFullscreen"
                    data-test="afsCloseFullscreen"
                    @click="emit('fullscreen')"
                >
                    <media-icon
                        name="close"
                        class="media-button-icon"
                    ></media-icon>
                </button>
            </div>
            <span
                v-else
                class="lmpl-afs-iconbtn lmpl-afs-spacer"
                aria-hidden="true"
            ></span>
        </div>

        <div class="lmpl-afs-main">
            <div
                class="lmpl-afs-artwrap"
                :class="{ 'lmpl-afs-artwrap-lyrics': lyricsInStage }"
            >
                <div
                    ref="stageEl"
                    class="lmpl-afs-art"
                    :class="{ 'lmpl-afs-art-lyrics': lyricsInStage }"
                    data-test="afsStage"
                >
                    <!-- The host's player stays mounted with sound alone, only hidden, so switching never stops playback. -->
                    <div
                        v-if="slots.stage"
                        v-show="isVideo"
                        class="lmpl-afs-stage"
                        data-test="afsStageSlot"
                    >
                        <slot name="stage"></slot>
                    </div>
                    <p
                        v-if="isVideo && caption"
                        class="lmpl-afs-caption"
                        data-test="afsCaption"
                    >
                        {{ caption }}
                    </p>
                    <!-- A drag along the picture's foot scrubs like the bar, for a thumb that lands short of it. -->
                    <div
                        v-if="isVideo && knownDuration && !isLive"
                        class="lmpl-afs-scrubzone"
                        data-test="afsScrubZone"
                        @pointerdown="onBarDown"
                        @pointermove="onBarMove"
                        @pointerup="onBarUp"
                        @pointercancel="onBarUp"
                    ></div>
                    <NowPlayingLyrics
                        v-if="lyricsInStage"
                        :lines="lyricLines"
                        :current-time="currentTime"
                        :playing="playing"
                        :rate="playbackRate"
                        :label="messages.lyrics"
                        @seek="emit('seek', $event)"
                    />
                    <img
                        v-else-if="!isVideo && cover?.src"
                        class="lmpl-afs-cover"
                        :src="cover.src"
                        :srcset="'srcset' in cover ? cover.srcset : undefined"
                        :sizes="'srcset' in cover && cover.srcset ? artworkSizes : undefined"
                        alt=""
                        draggable="false"
                        data-test="afsCover"
                        @error="coverFailed = true"
                    />
                    <div
                        v-else-if="!isVideo"
                        class="lmpl-afs-cover lmpl-afs-cover-empty"
                        aria-hidden="true"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            width="40%"
                            height="40%"
                            fill="currentColor"
                        >
                            <path
                                d="M19.952 1.651a.75.75 0 0 1 .298.599V16.303a3 3 0 0 1-2.176 2.884l-1.32.377a2.553 2.553 0 1 1-1.403-4.909l2.311-.66a1.5 1.5 0 0 0 1.088-1.442V6.994l-9 2.572v9.737a3 3 0 0 1-2.176 2.884l-1.32.377a2.553 2.553 0 1 1-1.403-4.909l2.311-.66a1.5 1.5 0 0 0 1.088-1.442V5.25a.75.75 0 0 1 .544-.721l10.5-3a.75.75 0 0 1 .658.122Z"
                            />
                        </svg>
                    </div>
                </div>
                <div
                    v-if="lyricsOn"
                    class="lmpl-afs-cueline"
                    data-test="afsCueLine"
                >
                    <span
                        class="lmpl-afs-cuegap"
                        aria-hidden="true"
                    ></span>
                    <p
                        class="lmpl-afs-cue"
                        data-test="afsCue"
                        @click="lyricsExpanded = !lyricsExpanded"
                    >
                        {{ lyricsExpanded ? "" : cueLine }}
                    </p>
                    <button
                        type="button"
                        class="lmpl-afs-iconbtn lmpl-afs-cuebtn"
                        :aria-label="messages.lyrics"
                        :aria-pressed="lyricsExpanded"
                        data-test="afsLyricsExpand"
                        @click="lyricsExpanded = !lyricsExpanded"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                        >
                            <path
                                :d="
                                    lyricsExpanded
                                        ? 'M20 9h-5V4M4 15h5v5M15 9l5-5M9 15l-5 5'
                                        : 'M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6'
                                "
                            />
                        </svg>
                    </button>
                </div>
            </div>

            <div class="lmpl-afs-info">
                <div class="lmpl-afs-titles">
                    <h2
                        class="lmpl-afs-title"
                        data-test="afsTitle"
                    >
                        {{ title }}
                    </h2>
                    <p
                        v-if="subtitle"
                        class="lmpl-afs-subtitle"
                    >
                        {{ subtitle }}
                    </p>
                    <span
                        v-if="chapters.length > 1 && chapterIndex >= 0"
                        class="lmpl-afs-chip"
                        data-test="afsChapterChip"
                    >
                        <i aria-hidden="true"></i
                        >{{
                            formatChapterOf(messages.chapterOf, chapterIndex + 1, chapters.length)
                        }}
                        · {{ chapters[chapterIndex]?.title }}
                    </span>
                    <!-- Under the title, the host's own way on from what plays (back to its page, say). -->
                    <div
                        v-if="slots['under-title'] || pictureTools"
                        class="lmpl-afs-undertitle"
                    >
                        <slot name="under-title"></slot>
                        <!-- What acts on the picture, on the right just above the seek bar: in the thumb's reach, out of the tools' row. -->
                        <div
                            v-if="pictureTools"
                            class="lmpl-afs-picturetools"
                            data-test="afsPictureTools"
                        >
                            <button
                                v-if="isVideo && canPictureInPicture"
                                type="button"
                                class="lmpl-afs-iconbtn"
                                :aria-label="messages.pictureInPicture"
                                data-test="afsPictureInPicture"
                                @click="emit('picture-in-picture')"
                            >
                                <media-icon
                                    name="pip-enter"
                                    class="media-button-icon"
                                ></media-icon>
                            </button>
                            <button
                                v-if="(isVideo || fullscreenTool) && !fullscreenActive"
                                type="button"
                                class="lmpl-afs-iconbtn"
                                :aria-label="messages.enterFullscreen"
                                data-test="afsFullscreen"
                                @click="emit('fullscreen')"
                            >
                                <media-icon
                                    name="fullscreen-enter"
                                    class="media-button-icon"
                                ></media-icon>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="lmpl-afs-controls">
                    <div class="lmpl-afs-timeline">
                        <span
                            class="lmpl-time"
                            :style="{ minWidth: timeWidth }"
                            data-test="afsElapsed"
                            >{{ clock(shownTime, timeGuide) }}</span
                        >
                        <div
                            ref="barEl"
                            class="lmpl-afs-bar"
                            :style="{ '--lmpl-afs-at': pct(shownTime) }"
                            role="slider"
                            tabindex="0"
                            aria-valuemin="0"
                            :aria-valuemax="knownDuration"
                            :aria-valuenow="Math.floor(shownTime)"
                            :aria-valuetext="clock(shownTime, timeGuide)"
                            :aria-label="messages.scrubberLabel"
                            :class="{
                                'lmpl-afs-bar-dragging': dragTime !== null,
                                'lmpl-afs-bar-open': scrubOpen,
                            }"
                            data-test="afsBar"
                            @pointerdown="onBarDown"
                            @pointermove="onBarMove"
                            @pointerup="onBarUp"
                            @pointercancel="onBarUp"
                            @keydown="onBarKey"
                        >
                            <div class="lmpl-afs-bar-track">
                                <div
                                    class="lmpl-afs-bar-buffer"
                                    :style="{ width: pct(bufferedEnd ?? 0) }"
                                ></div>
                                <div
                                    class="lmpl-afs-bar-fill"
                                    :style="{ width: pct(shownTime) }"
                                ></div>
                            </div>
                        </div>
                        <span
                            v-if="isLive"
                            class="lmpl-time lmpl-afs-live"
                            data-test="afsLive"
                            >{{ messages.live }}</span
                        >
                        <span
                            v-else
                            class="lmpl-time lmpl-time-end"
                            :style="{ minWidth: timeWidth }"
                            data-test="afsRemaining"
                            >-{{ clock(Math.max(0, knownDuration - shownTime), timeGuide) }}</span
                        >
                    </div>

                    <div class="lmpl-afs-bottomrow">
                        <div class="lmpl-afs-transport">
                            <button
                                v-if="skipBackSeconds > 0 && !isLive"
                                type="button"
                                class="lmpl-afs-skip"
                                :aria-label="formatSeconds(messages.skipBack, skipBackSeconds)"
                                data-test="afsSkipBack"
                                @click="skip(-skipBackSeconds)"
                                v-html="skipIcon(skipBackSeconds, false)"
                            ></button>
                            <button
                                type="button"
                                class="lmpl-afs-playbtn"
                                :class="{ 'lmpl-afs-busy': busy }"
                                :aria-label="
                                    busy
                                        ? messages.loading
                                        : playing
                                          ? messages.pause
                                          : messages.play
                                "
                                :aria-busy="busy ? 'true' : undefined"
                                data-test="afsPlay"
                                @click="onPlayButton"
                            >
                                <svg
                                    v-if="busy"
                                    class="lmpl-afs-spinner"
                                    viewBox="0 0 24 24"
                                    width="30"
                                    height="30"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.6"
                                    stroke-linecap="round"
                                    aria-hidden="true"
                                    data-test="afsSpinner"
                                >
                                    <path d="M12 3a9 9 0 1 1-9 9" />
                                </svg>
                                <media-icon
                                    v-else-if="playing"
                                    name="pause"
                                    class="media-button-icon"
                                    data-test="afsPauseIcon"
                                ></media-icon>
                                <media-icon
                                    v-else
                                    name="play"
                                    class="media-button-icon"
                                    data-test="afsPlayIcon"
                                ></media-icon>
                            </button>
                            <button
                                v-if="skipForwardSeconds > 0 && !isLive"
                                type="button"
                                class="lmpl-afs-skip"
                                :aria-label="
                                    formatSeconds(messages.skipForward, skipForwardSeconds)
                                "
                                data-test="afsSkipForward"
                                @click="skip(skipForwardSeconds)"
                                v-html="skipIcon(skipForwardSeconds, true)"
                            ></button>
                        </div>

                        <div
                            class="lmpl-afs-tools"
                            data-afs-tools
                        >
                            <div class="lmpl-afs-tool">
                                <button
                                    type="button"
                                    class="lmpl-afs-iconbtn"
                                    :aria-label="messages.speedLabel"
                                    :aria-expanded="menu === 'speed'"
                                    aria-haspopup="menu"
                                    data-test="afsSpeed"
                                    @click="toggleMenu('speed')"
                                >
                                    <media-icon
                                        name="speed"
                                        class="media-button-icon"
                                    ></media-icon>
                                    <span
                                        v-if="playbackRate !== 1"
                                        class="lmpl-afs-badge"
                                        >{{ speedText(playbackRate) }}</span
                                    >
                                </button>
                                <div
                                    v-if="menu === 'speed'"
                                    class="lmpl-afs-menu"
                                    role="menu"
                                    :aria-label="messages.speedLabel"
                                >
                                    <button
                                        v-for="rate in SPEED_OPTIONS"
                                        :key="rate"
                                        type="button"
                                        role="menuitemradio"
                                        :aria-checked="rate === playbackRate"
                                        class="lmpl-afs-menuitem"
                                        @click="chooseRate(rate)"
                                    >
                                        {{ speedText(rate) }}
                                    </button>
                                </div>
                            </div>

                            <div
                                v-if="isVideo && (qualities?.length ?? 0) > 1"
                                class="lmpl-afs-tool"
                            >
                                <button
                                    type="button"
                                    class="lmpl-afs-iconbtn"
                                    :aria-label="messages.qualityLabel"
                                    :aria-expanded="menu === 'quality'"
                                    aria-haspopup="menu"
                                    data-test="afsQuality"
                                    @click="toggleMenu('quality')"
                                >
                                    <media-icon
                                        name="switches"
                                        class="media-button-icon"
                                    ></media-icon>
                                    <span
                                        v-if="activeQualityId && activeQualityId !== 'auto'"
                                        class="lmpl-afs-badge"
                                        >{{
                                            qualities?.find((q) => q.id === activeQualityId)?.label
                                        }}</span
                                    >
                                </button>
                                <div
                                    v-if="menu === 'quality'"
                                    class="lmpl-afs-menu"
                                    role="menu"
                                    :aria-label="messages.qualityLabel"
                                >
                                    <button
                                        type="button"
                                        role="menuitemradio"
                                        :aria-checked="
                                            !activeQualityId || activeQualityId === 'auto'
                                        "
                                        class="lmpl-afs-menuitem"
                                        data-test="afsQualityAuto"
                                        @click="chooseQuality('auto')"
                                    >
                                        {{ messages.qualityAuto }}
                                    </button>
                                    <button
                                        v-for="quality in qualities"
                                        :key="quality.id"
                                        type="button"
                                        role="menuitemradio"
                                        :aria-checked="quality.id === activeQualityId"
                                        class="lmpl-afs-menuitem"
                                        @click="chooseQuality(quality.id)"
                                    >
                                        {{ quality.label }}
                                    </button>
                                </div>
                            </div>

                            <div
                                v-if="audioTracks.length > 1"
                                class="lmpl-afs-tool"
                            >
                                <button
                                    type="button"
                                    class="lmpl-afs-iconbtn"
                                    :aria-label="messages.audioMenuLabel"
                                    :aria-expanded="menu === 'language'"
                                    aria-haspopup="menu"
                                    data-test="afsLanguage"
                                    @click="toggleMenu('language')"
                                >
                                    <media-icon
                                        name="language"
                                        class="media-button-icon"
                                    ></media-icon>
                                </button>
                                <div
                                    v-if="menu === 'language'"
                                    class="lmpl-afs-menu"
                                    role="menu"
                                    :aria-label="messages.audioMenuLabel"
                                >
                                    <button
                                        v-for="track in audioTracks"
                                        :key="track.id"
                                        type="button"
                                        role="menuitemradio"
                                        :aria-checked="track.id === activeAudioTrackId"
                                        class="lmpl-afs-menuitem"
                                        @click="chooseTrack(track.id)"
                                    >
                                        {{ track.label }}
                                    </button>
                                </div>
                            </div>

                            <div
                                v-if="!isVideo"
                                class="lmpl-afs-tool"
                            >
                                <button
                                    type="button"
                                    class="lmpl-afs-iconbtn"
                                    :aria-label="messages.sleepTimer"
                                    :aria-expanded="menu === 'sleep'"
                                    aria-haspopup="menu"
                                    :class="{ 'lmpl-afs-on': sleepTimer }"
                                    data-test="afsSleep"
                                    @click="toggleMenu('sleep')"
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        width="22"
                                        height="22"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="1.8"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        aria-hidden="true"
                                    >
                                        <path
                                            d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"
                                        />
                                    </svg>
                                    <span
                                        v-if="sleepCaption"
                                        class="lmpl-afs-badge"
                                        data-test="afsSleepCaption"
                                        >{{ sleepCaption }}</span
                                    >
                                </button>
                                <div
                                    v-if="menu === 'sleep'"
                                    class="lmpl-afs-menu"
                                    role="menu"
                                    :aria-label="messages.sleepTimer"
                                >
                                    <button
                                        type="button"
                                        role="menuitemradio"
                                        :aria-checked="sleepTimer === null"
                                        class="lmpl-afs-menuitem"
                                        data-test="afsSleepOff"
                                        @click="chooseSleep(null)"
                                    >
                                        {{ messages.sleepOff }}
                                    </button>
                                    <button
                                        v-for="minutes in SLEEP_MINUTES"
                                        :key="minutes"
                                        type="button"
                                        role="menuitemradio"
                                        class="lmpl-afs-menuitem"
                                        :data-test="`afsSleep${minutes}`"
                                        @click="chooseSleep({ kind: 'minutes', minutes })"
                                    >
                                        {{ formatMinutes(messages.sleepMinutes, minutes) }}
                                    </button>
                                    <button
                                        v-if="chapters.length > 1 && chapterIndex >= 0"
                                        type="button"
                                        role="menuitemradio"
                                        :aria-checked="sleepTimer?.kind === 'chapter'"
                                        class="lmpl-afs-menuitem"
                                        data-test="afsSleepChapter"
                                        @click="chooseSleep({ kind: 'chapter' })"
                                    >
                                        {{ messages.sleepEndOfChapter }}
                                    </button>
                                </div>
                            </div>

                            <div
                                v-if="!isVideo && subtitleTracks.length > 0"
                                class="lmpl-afs-tool"
                            >
                                <button
                                    type="button"
                                    class="lmpl-afs-iconbtn"
                                    :class="{ 'lmpl-afs-on': showLyrics }"
                                    :aria-label="messages.lyrics"
                                    :aria-expanded="menu === 'subtitles'"
                                    aria-haspopup="menu"
                                    data-test="afsLyricsLanguage"
                                    @click="toggleMenu('subtitles')"
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        width="22"
                                        height="22"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="1.8"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        aria-hidden="true"
                                    >
                                        <path d="M4 6h16M4 10h10M4 14h16M4 18h7" />
                                        <circle
                                            cx="18"
                                            cy="18"
                                            r="2"
                                        />
                                    </svg>
                                </button>
                                <div
                                    v-if="menu === 'subtitles'"
                                    class="lmpl-afs-menu"
                                    role="menu"
                                    :aria-label="messages.lyrics"
                                >
                                    <button
                                        type="button"
                                        role="menuitemradio"
                                        :aria-checked="!activeSubtitleTrackId"
                                        class="lmpl-afs-menuitem"
                                        data-test="afsLyricsOff"
                                        @click="chooseSubtitles(null)"
                                    >
                                        {{ messages.subtitlesOff }}
                                    </button>
                                    <button
                                        v-for="track in subtitleTracks"
                                        :key="track.id"
                                        type="button"
                                        role="menuitemradio"
                                        :aria-checked="track.id === activeSubtitleTrackId"
                                        class="lmpl-afs-menuitem"
                                        @click="chooseSubtitles(track.id)"
                                    >
                                        {{ track.label }}
                                    </button>
                                </div>
                            </div>

                            <div
                                v-if="isVideo && subtitleTracks.length > 0"
                                class="lmpl-afs-tool"
                            >
                                <button
                                    type="button"
                                    class="lmpl-afs-iconbtn"
                                    :class="{ 'lmpl-afs-on': activeSubtitleTrackId }"
                                    :aria-label="messages.subtitlesMenuLabel"
                                    :aria-expanded="menu === 'subtitles'"
                                    aria-haspopup="menu"
                                    data-test="afsSubtitles"
                                    @click="toggleMenu('subtitles')"
                                >
                                    <media-icon
                                        :name="
                                            activeSubtitleTrackId ? 'captions-on' : 'captions-off'
                                        "
                                        class="media-button-icon"
                                    ></media-icon>
                                </button>
                                <div
                                    v-if="menu === 'subtitles'"
                                    class="lmpl-afs-menu"
                                    role="menu"
                                    :aria-label="messages.subtitlesMenuLabel"
                                >
                                    <button
                                        type="button"
                                        role="menuitemradio"
                                        :aria-checked="!activeSubtitleTrackId"
                                        class="lmpl-afs-menuitem"
                                        data-test="afsSubtitlesOff"
                                        @click="chooseSubtitles(null)"
                                    >
                                        {{ messages.subtitlesOff }}
                                    </button>
                                    <button
                                        v-for="track in subtitleTracks"
                                        :key="track.id"
                                        type="button"
                                        role="menuitemradio"
                                        :aria-checked="track.id === activeSubtitleTrackId"
                                        class="lmpl-afs-menuitem"
                                        @click="chooseSubtitles(track.id)"
                                    >
                                        {{ track.label }}
                                    </button>
                                </div>
                            </div>

                            <slot name="audio-tool"></slot>

                            <slot name="cast"></slot>

                            <button
                                v-if="hasBrowse"
                                type="button"
                                class="lmpl-afs-iconbtn"
                                :aria-label="messages.browse"
                                data-test="afsBrowse"
                                @click="openChapters()"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    width="22"
                                    height="22"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linecap="round"
                                    aria-hidden="true"
                                >
                                    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Chapters and up next, over this screen: the web player's own panel. A pick goes there and it closes. -->
        <BrowsePanel
            v-if="browseOpen"
            :initial-tab="browseTab"
            :chapters="chapters"
            :current-chapter="chapterIndex"
            :up-next="upNext"
            :messages="messages"
            :id-prefix="uid"
            :thumbnail-at="thumbnailAt"
            data-test="afsSheet"
            @close="browseOpen = false"
            @pick-chapter="pickChapter"
            @pick-upnext="pickUpNext"
        />
    </div>
</template>
