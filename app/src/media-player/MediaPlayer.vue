<script setup lang="ts">
/**
 * The app-wide media player: one player for audio and video, mounted once, that keeps playing
 * while the viewer browses. Full, it fills the space between the page's top bar and the mobile
 * menu, showing the picture or the cover with the transport; minimised, a bar riding on the menu. `VideoPlayer` stays mounted in the picture area for as long as an item
 * plays, so minimising never restarts it.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import {
    BookOpenIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    FilmIcon,
    MoonIcon,
    MusicalNoteIcon,
    PauseIcon,
    PlayIcon,
    XMarkIcon,
    ArrowsPointingOutIcon,
} from "@heroicons/vue/20/solid";
import {
    AUDIO_ONLY_ANGLE_ID,
    AudioFullscreen,
    ScrubRoster,
    chapterIndexAt,
    chapterMask,
    chapterSegments,
    mergeMessages,
    rosterFineStep,
    rosterStep,
    rosterTiles,
    type ScrubPosition,
    type Chapter,
} from "@luminary-media-converter/player-web";
import { db, type ContentDto, type Uuid } from "luminary-shared";
import { DateTime } from "luxon";
import VideoPlayer from "@/components/content/VideoPlayer.vue";
import LImage from "@/components/images/LImage.vue";
import { useMobileChromeAutoHide } from "@/composables/useMobileChromeAutoHide";
import { isDarkTheme, isMac } from "@/globalConfig";
import { useBucketInfo } from "@/composables/useBucketInfo";
import { fallbackImageFor } from "@/util/fallbackArtwork";
import { coverImageUrl, thumbHashWash } from "./coverImage";
import { usePlayerMessages } from "./usePlayerMessages";
import { isNativeApp } from "@/util/inAppBrowser";
import MediaPlayerChapters from "./MediaPlayerChapters.vue";
import MediaPlayerMenu from "./MediaPlayerMenu.vue";
import V10Button from "./V10Button.vue";
import { videoSourceFor } from "@/util/videoSource";
import { isYouTubeLink } from "@/util/youtube";
import V10Icon from "./V10Icon.vue";
import { timeEnds } from "./v10Time";
import MediaPlayerMenuItem from "./MediaPlayerMenuItem.vue";
import MediaPlayerUpNext from "./MediaPlayerUpNext.vue";
import { useUpNext } from "./useUpNext";
import { useNextUp } from "./useNextUp";
import { useMediaPlayerShortcuts } from "./useMediaPlayerShortcuts";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { markPlayerSwap } from "@/util/playerSwap";
import {
    closeMediaPlayer,
    openMediaPlayer,
    expandMediaPlayer,
    mediaPlayerItem,
    mediaPlayerView,
    minimiseMediaPlayer,
    startsAsAudio,
} from "./mediaPlayer";

const { t } = useI18n();
const router = useRouter();

/** The speeds the player's own full-screen offers, so both agree. */
const RATES = [0.5, 0.7, 1, 1.5];
const SKIP_SECONDS = 10;
/**
 * When a pull down lets go of what it moves: far enough (two fifths of its height), or after a throw (a
 * fifth of it, at a speed a casual swipe does not reach). Anything less springs back.
 */
const LET_GO_FRACTION = 0.4;
const THROW_MIN_FRACTION = 0.2;
/** In px per ms; a casual swipe is about a third of this. */
const THROW_SPEED = 1.5;
function letsGo(moved: number, speed: number, height: number): boolean {
    return (
        moved > height * LET_GO_FRACTION ||
        (moved > height * THROW_MIN_FRACTION && speed > THROW_SPEED)
    );
}

const engine = ref<InstanceType<typeof VideoPlayer> | null>(null);
const handle = computed(() => engine.value?.player ?? null);
const controller = computed(() => handle.value?.controller ?? null);
const state = computed(() => handle.value?.state ?? null);

const item = mediaPlayerItem;
const expanded = computed(() => mediaPlayerView.value === "expanded");
const content = computed(() => item.value?.content);

/** The lists the sheet under the picture offers: this video's chapters, and what leads to other videos. */
type SheetTab = "upnext" | "chapters";
/** The tab the sheet under the picture shows; none while it is closed. */
const sheetTab = ref<SheetTab | null>(null);
/** The tag the Up next lists are narrowed to; it goes with the video, and the next one starts at All. */
const upNextTag = ref<Uuid | null>(null);
const upNext = useUpNext(content, upNextTag);
const { nextContents, nextUp } = useNextUp(upNext);
/** Up next has had something to offer for this video: the tab stays while a new choice loads. */
const hadUpNext = ref(false);
watch(
    () => content.value?.parentId,
    () => {
        upNextTag.value = null;
        hadUpNext.value = false;
    },
);
watch(
    () => upNext.value.next.length + upNext.value.related.length,
    (count) => {
        if (count) hadUpNext.value = true;
    },
    { immediate: true },
);
const chapters = computed(() => state.value?.chapters ?? []);
/**
 * The tabs that have something to show; none when the video has no chapters and nothing leads on
 * from it. What the content says (its summary, article and tags) is on its page, which the bar at
 * the foot opens.
 */
const tabs = computed<{ id: SheetTab; label: string }[]>(() => [
    // Chapters come first: they belong to this video, ahead of what leads to others.
    ...(chapters.value.length
        ? [{ id: "chapters" as const, label: t("media_player.chapters") }]
        : []),
    // A chosen tag that has nothing left, or lists still loading, keep the tab: the viewer goes back to All.
    ...(upNext.value.next.length ||
    upNext.value.related.length ||
    upNextTag.value ||
    hadUpNext.value
        ? [{ id: "upnext" as const, label: t("media_player.up_next") }]
        : []),
]);
const sheetLabel = computed(() =>
    sheetTab.value === "chapters"
        ? t("media_player.chapters")
        : (tabs.value.find((tab) => tab.id === sheetTab.value)?.label ?? ""),
);
const pictureEl = ref<HTMLElement | null>(null);
const sectionEl = ref<HTMLElement | null>(null);
/** Where the sheet starts: just under the picture, which stays in view. */
const sheetTop = ref(0);
/** The shortest stretch a drag's speed is read over. */
const MIN_SPEED_SAMPLE_MS = 4;
/** How long the sheet takes to slide away or spring back once let go. */
const SHEET_SLIDE_MS = 200;
const sheetDragY = ref(0);
const sheetDragging = ref(false);
/** Sliding out: the sheet is on its way off, and goes when it has gone. */
const sheetLeaving = ref(false);
const sheetEl = ref<HTMLElement | null>(null);
let sheetTouchY: number | null = null;
let sheetLastY = 0;
let sheetLastTime = 0;
let sheetSpeed = 0;
let sheetLeaveTimer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(sheetLeaveTimer));
/** The touch began on a list that is at its top (or on no list): a pull down is for the sheet. */
let sheetTouchAtTop = true;
function onSheetTouchStart(event: TouchEvent) {
    if (sheetLeaving.value) return;
    sheetTouchY = event.touches[0]?.clientY ?? null;
    sheetLastY = sheetTouchY ?? 0;
    sheetLastTime = event.timeStamp;
    sheetSpeed = 0;
    const scroller = (event.target as HTMLElement | null)?.closest<HTMLElement>(".overflow-y-auto");
    sheetTouchAtTop = !scroller || scroller.scrollTop <= 0;
}
function onSheetTouchMove(event: TouchEvent) {
    if (sheetTouchY === null || !sheetTouchAtTop) return;
    const y = event.touches[0]?.clientY ?? sheetTouchY;
    const pull = y - sheetTouchY;
    if (pull <= 0 && !sheetDragging.value) return;
    const elapsed = event.timeStamp - sheetLastTime;
    if (elapsed >= MIN_SPEED_SAMPLE_MS) sheetSpeed = (y - sheetLastY) / elapsed;
    sheetLastY = y;
    sheetLastTime = event.timeStamp;
    // The page does not scroll or bounce under a pull that is the sheet's.
    if (event.cancelable) event.preventDefault();
    sheetDragging.value = true;
    sheetDragY.value = Math.max(0, pull);
}
function closeSheet() {
    // Out through the foot of the player, then gone: an element that is removed cannot slide.
    sheetLeaving.value = true;
    sheetDragY.value = sheetEl.value?.offsetHeight || window.innerHeight;
    clearTimeout(sheetLeaveTimer);
    sheetLeaveTimer = setTimeout(() => {
        sheetTab.value = null;
        sheetLeaving.value = false;
        sheetDragY.value = 0;
    }, SHEET_SLIDE_MS);
}
function onSheetTouchEnd() {
    if (sheetTouchY === null) return;
    const moved = sheetDragY.value;
    sheetTouchY = null;
    sheetDragging.value = false;
    if (letsGo(moved, sheetSpeed, sheetEl.value?.offsetHeight || window.innerHeight)) closeSheet();
    else sheetDragY.value = 0;
}

/** A tab of the open sheet: it shows that one, and the sheet stays where it is. */
function selectTab(tab: SheetTab) {
    sheetTab.value = tab;
}
async function toggleTab(tab: SheetTab) {
    sheetTab.value = sheetTab.value === tab ? null : tab;
    if (!sheetTab.value) return;
    await nextTick();
    const picture = pictureEl.value?.getBoundingClientRect();
    const section = sectionEl.value?.getBoundingClientRect();
    sheetTop.value = picture && section ? picture.bottom - section.top : 0;
}
// Another item, or the player gone: the sheet closes with it. So does a tab whose content went.
watch(
    () => item.value?.content._id,
    () => (sheetTab.value = null),
);
watch(expanded, (isExpanded) => {
    if (!isExpanded) sheetTab.value = null;
});
watch([tabs, chapters], ([available, chapterList]) => {
    if (sheetTab.value === "chapters") {
        if (!chapterList.length) sheetTab.value = null;
    } else if (sheetTab.value && !available.some((tab) => tab.id === sheetTab.value)) {
        sheetTab.value = null;
    }
});

/**
 * A frame of the video for a chapter row to lead with; none until the video's thumbnails have
 * arrived, and none for a video encoded without them.
 */
function chapterCueAt(time: number) {
    return state.value?.thumbnailsReady
        ? (handle.value?.controller?.thumbnailAt(time) ?? null)
        : null;
}

/** A chapter: the picture goes there, and plays on. */
function playChapter(chapter: Chapter) {
    handle.value?.seek(chapter.startTime);
    void handle.value?.play();
}

/** Another video, offered under this one: it takes the player. */
function playNext(next: ContentDto) {
    openMediaPlayer(next, item.value?.language);
}

/**
 * A next video, chosen in full-screen: it takes the player, which stays mounted and expanded so
 * full-screen carries on, and its page opens behind. The route change would minimise the player, which
 * is let through only for this one.
 */
function swapToNext(id: string) {
    const next = nextContents.value.find((doc) => doc._id === id);
    if (!next) return;
    const location = { name: "content", params: { slug: next.slug } };
    markPlayerSwap(router.resolve(location).fullPath);
    openMediaPlayer(next, item.value?.language);
    void router.push(location);
}

/** The page of what plays, which also minimises the player: the route change does it. */
function openPage() {
    const slug = content.value?.slug;
    if (slug) void router.push({ name: "content", params: { slug } });
}

// On a phone the full player covers the page's top bar and the mobile menu, and puts the chrome
// away with them: the status bar steps aside with it in the packaged app, for a screen of its own.
// Minimising hands the page back with its bars showing, whatever its scroll had done meanwhile.
const mobileChrome = useMobileChromeAutoHide();
watch(
    expanded,
    (isExpanded) => {
        if (!item.value) return;
        const phone = !window.matchMedia("(min-width: 1024px)").matches;
        mobileChrome.hidden.value = isExpanded && phone;
    },
    { immediate: true },
);

// Pages keep their content clear of the bar through --media-bar-h, as they do for the menu.
const bar = ref<HTMLElement | null>(null);
let barObserver: ResizeObserver | null = null;
function publishBarHeight() {
    const height = bar.value?.getBoundingClientRect().height ?? 0;
    if (height > 0) document.documentElement.style.setProperty("--media-bar-h", `${height}px`);
    else document.documentElement.style.removeProperty("--media-bar-h");
}
watch(bar, (element, previous) => {
    if (previous) barObserver?.unobserve(previous);
    if (element) barObserver?.observe(element);
    publishBarHeight();
});
onMounted(() => {
    if (typeof ResizeObserver !== "undefined") barObserver = new ResizeObserver(publishBarHeight);
});
onBeforeUnmount(() => {
    barObserver?.disconnect();
    document.documentElement.style.removeProperty("--media-bar-h");
});

// Read once per item: switching Data Saver mid-play changes the next item, not this one.
const startAudio = ref(false);
watch(
    () => item.value?.content._id,
    () => (startAudio.value = startsAsAudio.value),
    { immediate: true },
);

/** Audio was asked for and the audio-only source is still loading: the picture would only be frozen until it arrives. */
const audioRequested = ref(false);
const audioMode = computed(
    () =>
        !!state.value &&
        (audioRequested.value ||
            state.value.isAudioOnly ||
            state.value.activeAngleId === AUDIO_ONLY_ANGLE_ID),
);
const playing = computed(() => state.value?.playing ?? false);
const currentTime = computed(() => state.value?.currentTime ?? 0);
const duration = computed(() => state.value?.duration ?? 0);
/** A live stream: the player says so (an engine reports no length for one), or the length is infinite. */
const live = computed(() => state.value?.live === true || duration.value === Infinity);
/**
 * The duration has arrived. Until then nothing about seeking is known, and a live stream has not yet
 * said so (it reports an infinite duration): the skip buttons, the bar and the speed are kept out of
 * sight, in their place (the speed is left out until then, so the row of buttons stays centred), so a live
 * stream does not show them for a moment and then take them away.
 */
const timeKnown = computed(() => duration.value > 0);
/**
 * The source is on its way and nothing has played yet: the picture is still black and the play
 * button would say "paused" for a moment that is only loading. A spinner takes the play button's place.
 */
const starting = computed(() => {
    if (!item.value || state.value?.lifecycle === "error") return false;
    // A video hosted by YouTube has no player to wait for until the viewer has chosen to play it: its notice
    // stands there, with nothing to report. After that it reports like any other.
    if (!state.value && isYouTubeLink(videoSourceFor(item.value.content))) return false;
    if (!state.value) return true;
    if (state.value.lifecycle === "loading") return true;
    return (
        state.value.lifecycle === "ready" &&
        !playing.value &&
        !state.value.ended &&
        // A live stream has no length to wait for, so paused it is not starting.
        !live.value &&
        duration.value === 0
    );
});
/**
 * The engine has run out of data mid-play (the connection dropped, or is too slow): the picture is
 * whatever native has left, often black, and nothing says why. A spinner over it does.
 */
const stalled = computed(() => !starting.value && state.value?.stalled === true);
const muted = computed(() => handle.value?.muted === true);

/**
 * The platform draws the video behind the page, in the picture area, which is left transparent;
 * the rest of the page behind the full player is hidden by the class below.
 */
const inlineVideo = computed(() => engine.value?.inlineActive === true);
const inlineHole = computed(() => expanded.value && inlineVideo.value && !audioMode.value);
watchEffect(() => document.documentElement.classList.toggle("lmc-inline-video", inlineHole.value));
onBeforeUnmount(() => document.documentElement.classList.remove("lmc-inline-video"));
/** `seconds` as a share of the duration, 0 while there is none. */
function fraction(seconds: number): number {
    return duration.value > 0 && Number.isFinite(duration.value)
        ? Math.min(Math.max(seconds / duration.value, 0), 1)
        : 0;
}
/**
 * Where the viewer's finger holds the bar while it is dragged, and for a moment after it is let go,
 * until playback has caught up: the bar and the time follow the finger, not the playing position,
 * which would pull the dot back on every update.
 */
const scrubTime = ref<number | null>(null);
const shownTime = computed(() => scrubTime.value ?? currentTime.value);
const progress = computed(() => fraction(shownTime.value));
/** The time row under the bar: what has played, and what is left, as the full-screen skin shows them. */
const timeRow = computed(() => timeEnds(shownTime.value, duration.value));
/** The most a seek is given to land before the bar follows playback again. */
const SCRUB_HOLD_MS = 1500;
let scrubTimer: ReturnType<typeof setTimeout> | undefined;
/** The finger is up: playback is being waited on. */
let released = false;
function endScrub() {
    clearTimeout(scrubTimer);
    fingerDown.value = false;
    released = false;
    scrubTime.value = null;
}
onBeforeUnmount(() => clearTimeout(scrubTimer));
/** The browser took the drag over: a roster the press had open still counts as let go there, as its change may never come. */
function cancelScrub(event: Event) {
    if (rosterOpened) seekTo(event);
    else endScrub();
}
function scrub(event: Event) {
    clearTimeout(scrubTimer);
    released = false;
    scrubTime.value = Number((event.target as HTMLInputElement).value);
    fingerDown.value = true;
    measurePicture();
}
// Playback reaching where it was sent hands the bar back to it.
watch(currentTime, (time) => {
    if (scrubTime.value !== null && released && Math.abs(time - scrubTime.value) < 2) endScrub();
});
const loaded = computed(() => fraction(state.value?.bufferedEnd ?? 0));

/**
 * The frames of the video around the finger, shown above the bar while it is dragged: the stretch of the
 * video around the dot, sliding past a marker kept under it, as in full-screen. Present only when the
 * video has scrub frames; one without them shows the time label alone.
 */
const pictureWidth = ref(0);
/** The bar's side padding (`px-10`) and the dot's own inset, which the marker has to follow. */
const SEEK_PADDING_PX = 40;
const SEEK_THUMB_INSET_PX = 8;
function measurePicture() {
    pictureWidth.value = pictureEl.value?.getBoundingClientRect().width ?? 0;
}
/** The frame is a sixth of the width, 16:9, and never smaller than a phone's thumb can read. */
const rosterHeightFor = (width: number) =>
    Math.round((Math.min(340, Math.max(168, width / 6)) * 9) / 16);
const rosterHeight = computed(() => rosterHeightFor(pictureWidth.value));
/** The strip of frames for a moment, `step` seconds to a frame, with the marker `markerX` px from the left. */
function buildRoster(
    time: number,
    markerX: number,
    step: number,
    width = pictureWidth.value,
) {
    const instance = controller.value;
    if (!instance || !(duration.value > 0) || !(width > 0)) return null;
    const sample = instance.thumbnailAt(0);
    if (!sample || !sample.w || !sample.h) return null;
    const height = rosterHeightFor(width);
    const tileWidth = Math.max(24, Math.round((height * sample.w) / sample.h));
    const tiles = rosterTiles(time, markerX, width, tileWidth, step, duration.value).map(
        (tile) => ({
            // A different step makes the same index a different slot, so the step is part of the identity.
            key: `${step}:${tile.index}`,
            left: tile.left,
            time: tile.time,
            cue: instance.thumbnailAt(tile.time),
        }),
    );
    return { tiles, tileWidth, height, markerX, time, step };
}

/** The now-playing screen's held bar, which has no picture element to measure; null when it is let go. */
const nowPlayingScrub = ref<ScrubPosition | null>(null);
/** Where the now-playing screen's frames sit once let go: they stay for slow scrubbing, as in full-screen. */
const nowPlayingPin = ref<{ width: number; bottom: number } | null>(null);
const nowPlayingRoster = computed(() => {
    if (audioMode.value || !state.value?.thumbnailsReady) return null;
    const scrub = nowPlayingScrub.value;
    if (scrub) {
        const roster = buildRoster(scrub.time, scrub.markerX, rosterStep(duration.value), scrub.width);
        return roster && { ...roster, bottom: scrub.bottom };
    }
    const pin = nowPlayingPin.value;
    if (!pin) return null;
    const roster = buildRoster(pinnedTime.value, pin.width / 2, rosterFineStep(duration.value), pin.width);
    return roster && { ...roster, bottom: pin.bottom };
});
function onNowPlayingScrub(position: ScrubPosition | null) {
    if (position) {
        nowPlayingScrub.value = position;
        if (nowPlayingRoster.value) {
            rosterOpened = true;
            pauseForScrub();
        }
        return;
    }
    const last = nowPlayingScrub.value;
    nowPlayingScrub.value = null;
    if (!last || !rosterOpened || audioMode.value || !state.value?.thumbnailsReady) return;
    rosterOpened = false;
    nowPlayingPin.value = { width: last.width, bottom: last.bottom };
    anchorPin(last.time);
}

/** The finger is on the bar. (`scrubTime` outlives it until playback arrives, so it cannot say.) */
const fingerDown = ref(false);

/**
 * The frames stay up after the finger lifts, as in full-screen, until a press lands outside the bar and
 * the frames.
 */
const rosterPinned = ref(false);
/** Where the pinned frames sit after a seek, until playback arrives; following it sooner would snap them back. Null follows playback. */
const pinnedAt = ref<number | null>(null);
/** The most a seek is given to land before the pinned frames follow playback again. */
const PIN_ANCHOR_MS = 1500;
let pinAnchorTimer: ReturnType<typeof setTimeout> | undefined;
function anchorPin(time: number) {
    pinnedAt.value = time;
    clearTimeout(pinAnchorTimer);
    pinAnchorTimer = setTimeout(() => (pinnedAt.value = null), PIN_ANCHOR_MS);
}
function releasePin() {
    pinnedAt.value = null;
    clearTimeout(pinAnchorTimer);
}
onBeforeUnmount(() => clearTimeout(pinAnchorTimer));

/** The playhead read every frame while frames are pinned: `currentTime` arrives a few times a second, which steps the strip. */
const pinnedPlayhead = ref(0);
let playheadBase = { time: 0, at: 0 };
let playheadFrame = 0;
watch(currentTime, (time) => (playheadBase = { time, at: performance.now() }), { immediate: true });
function trackPlayhead() {
    const { time, at } = playheadBase;
    const rate = state.value?.playbackRate ?? 1;
    const ahead = playing.value ? ((performance.now() - at) / 1000) * rate : 0;
    pinnedPlayhead.value = Math.min(time + ahead, Math.max(0, duration.value - 0.001));
    playheadFrame = requestAnimationFrame(trackPlayhead);
}
const pinnedTime = computed(() => rosterDrag.value?.time ?? pinnedAt.value ?? pinnedPlayhead.value);
// Playback reaching the seek hands the strip back to it.
watch(pinnedPlayhead, (time) => {
    if (pinnedAt.value !== null && Math.abs(time - pinnedAt.value) < 0.75) releasePin();
});

interface RosterDrag {
    startX: number;
    lastX: number;
    time: number;
    moved: boolean;
}
/** The pinned frames being dragged: the slow, precise way through the video. */
const rosterDrag = ref<RosterDrag | null>(null);
/** How far a finger may wander and still be tapping a frame rather than dragging the strip. */
const TAP_SLOP_PX = 10;

/**
 * While the bar is held, the fast way through the video: the frames follow the dot along the bar, several
 * seconds to a frame. Once let go they are centred and finer, to be dragged.
 */
const heldRoster = computed(() => {
    // Sound alone has no picture to show frames of.
    if (!(fingerDown.value || rosterPinned.value) || !state.value?.thumbnailsReady) return null;
    if (audioMode.value) return null;
    if (!fingerDown.value) {
        return buildRoster(pinnedTime.value, pictureWidth.value / 2, rosterFineStep(duration.value));
    }
    const time = shownTime.value;
    const barWidth = pictureWidth.value - 2 * SEEK_PADDING_PX - 2 * SEEK_THUMB_INSET_PX;
    const markerX = SEEK_PADDING_PX + SEEK_THUMB_INSET_PX + barWidth * fraction(time);
    return buildRoster(time, markerX, rosterStep(duration.value));
});

/** The pinned frames being dragged: the desktop strip over the picture, or the now-playing screen's. */
const dragRoster = computed(() => (nowPlayingPin.value ? nowPlayingRoster.value : heldRoster.value));

/**
 * Whether the roster was shown during this press. Remembered apart from `fingerDown`, because a phone's
 * browser may cancel the pointer when it takes the slider's drag over, and only then report the change:
 * by that time the finger is already "up", but the viewer did hold the roster.
 */
let rosterOpened = false;
/** Whether the video was playing when the frames took over: it plays on after, a paused one stays paused. */
let resumeAfterScrub = false;
function pauseForScrub() {
    if (resumeAfterScrub || !playing.value) return;
    resumeAfterScrub = true;
    handle.value?.pause();
}
function resumeFromScrub() {
    if (!resumeAfterScrub) return;
    resumeAfterScrub = false;
    void handle.value?.play();
}
/** Looking for a moment in the frames is not watching: the video waits, and plays on from where it is let go. */
watch(
    () => fingerDown.value && heldRoster.value !== null,
    (holding) => {
        if (!holding) return;
        rosterOpened = true;
        pauseForScrub();
    },
);

const seekArea = ref<HTMLElement | null>(null);
const rosterEl = ref<HTMLElement | null>(null);
/** A press anywhere but the bar or the frames puts the pinned frames away. */
function onPressOutsideRoster(event: Event) {
    const target = event.target as Node | null;
    if (target && (seekArea.value?.contains(target) || rosterEl.value?.contains(target))) return;
    if ((target as Element | null)?.closest?.(".lmpl-afs-bar, .lmpl-afs-scrubzone")) return;
    rosterPinned.value = false;
    nowPlayingPin.value = null;
    rosterDrag.value = null;
    resumeFromScrub();
}
watch(
    () => rosterPinned.value || nowPlayingPin.value !== null,
    (pinned) => {
    cancelAnimationFrame(playheadFrame);
    if (pinned) {
        document.addEventListener("pointerdown", onPressOutsideRoster, true);
        trackPlayhead();
    } else {
        document.removeEventListener("pointerdown", onPressOutsideRoster, true);
        releasePin();
    }
    },
);
onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", onPressOutsideRoster, true);
    cancelAnimationFrame(playheadFrame);
});
// Another video, or no picture to show frames over, leaves nothing to keep.
watch([() => item.value?.content._id, expanded, audioMode], () => {
    rosterPinned.value = false;
    nowPlayingPin.value = null;
});
/**
 * What is loaded shows once it reaches past what has played by a visible amount (about 2 px of the
 * bar): a smaller stretch would only be a hairline at the corner of the yellow.
 */
const LOADED_VISIBLE_FRACTION = 0.006;
const loadedShows = computed(() => loaded.value - progress.value > LOADED_VISIBLE_FRACTION);

/** The last camera seen playing, where Video returns to. */
let videoAngleId: string | null = null;
watch(
    () => state.value?.activeAngleId,
    (id) => {
        if (id && id !== AUDIO_ONLY_ANGLE_ID) videoAngleId = id;
    },
);
const videoAngles = computed(
    () => state.value?.angles.filter((angle) => angle.id !== AUDIO_ONLY_ANGLE_ID) ?? [],
);
const canSwitch = computed(
    () =>
        !!controller.value &&
        !!state.value?.angles.some((angle) => angle.id === AUDIO_ONLY_ANGLE_ID) &&
        videoAngles.value.length > 0,
);

async function showAudio() {
    if (audioMode.value) return;
    audioRequested.value = true;
    try {
        await controller.value?.setAngle(AUDIO_ONLY_ANGLE_ID);
    } finally {
        audioRequested.value = false;
    }
}

async function showVideo() {
    const audioPending = audioRequested.value;
    audioRequested.value = false;
    const target =
        videoAngleId ??
        videoAngles.value.find((angle) => angle.isDefault)?.id ??
        videoAngles.value[0]?.id;
    if ((audioMode.value || audioPending) && target) await controller.value?.setAngle(target);
    // Where the platform cannot draw the video in the page, the app shows it in its native
    // full-screen; the web shows it in the player.
    if (isNativeApp() && !inlineVideo.value) await handle.value?.enterFullscreen();
}

function togglePlay() {
    if (playing.value) handle.value?.pause();
    else void handle.value?.play();
}

function skip(seconds: number) {
    const target = Math.min(Math.max(currentTime.value + seconds, 0), duration.value || Infinity);
    handle.value?.seek(target);
}

/** Held until playback arrives (or a while has passed), so the dot does not fall back meanwhile. */
function holdScrubAt(target: number) {
    scrubTime.value = target;
    released = true;
    clearTimeout(scrubTimer);
    scrubTimer = setTimeout(endScrub, SCRUB_HOLD_MS);
}

function seekTo(event: Event) {
    const target = Number((event.target as HTMLInputElement).value);
    handle.value?.seek(target);
    // With frames up the video stays paused for slow scrubbing; a press outside resumes it.
    if (!rosterOpened && !rosterPinned.value) resumeFromScrub();
    fingerDown.value = false;
    // Only a press outside unpins: a second report of the same release (the browser's cancel, then its change) must not.
    if (rosterOpened) rosterPinned.value = true;
    if (rosterPinned.value) anchorPin(target);
    rosterOpened = false;
    holdScrubAt(target);
}

function onRosterDown(event: PointerEvent) {
    const roster = dragRoster.value;
    if (!roster) return;
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    pauseForScrub();
    rosterDrag.value = { startX: event.clientX, lastX: event.clientX, time: pinnedTime.value, moved: false };
}
function onRosterMove(event: PointerEvent) {
    const drag = rosterDrag.value;
    const roster = dragRoster.value;
    if (!drag || !roster) return;
    // The strip follows the finger one-to-one, at a scale that does not change during the drag.
    const time = drag.time - (event.clientX - drag.lastX) / (roster.tileWidth / roster.step);
    rosterDrag.value = {
        ...drag,
        lastX: event.clientX,
        time: Math.min(Math.max(0, time), Math.max(0, duration.value - 0.001)),
        moved: drag.moved || Math.abs(event.clientX - drag.startX) > TAP_SLOP_PX,
    };
}
/**
 * A sideways drag on the picture itself opens the frames and scrolls them, the slow way through the video,
 * so the bar is not the only way in. A press that stays put, or goes up and down, is not one.
 */
let pictureGesture: { x: number; y: number } | null = null;
function onPictureDown(event: PointerEvent) {
    pictureGesture = null;
    if (audioMode.value || !state.value?.thumbnailsReady || !(duration.value > 0) || live.value) return;
    if ((event.target as Element | null)?.closest?.("button, a, input, select, textarea")) return;
    pictureGesture = { x: event.clientX, y: event.clientY };
}
function onPictureMove(event: PointerEvent) {
    if (rosterDrag.value) return onRosterMove(event);
    const start = pictureGesture;
    if (!start) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) <= TAP_SLOP_PX || Math.abs(dx) <= Math.abs(event.clientY - start.y)) return;
    pictureGesture = null;
    (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
    measurePicture();
    pauseForScrub();
    rosterOpened = true;
    rosterPinned.value = true;
    rosterDrag.value = { startX: event.clientX, lastX: event.clientX, time: shownTime.value, moved: true };
}
function onPictureUp(event: PointerEvent) {
    pictureGesture = null;
    if (rosterDrag.value) onRosterUp(event);
}

function onRosterUp(event: PointerEvent) {
    const drag = rosterDrag.value;
    const roster = dragRoster.value;
    rosterDrag.value = null;
    // A phone's browser may cancel a drag it takes over: where the strip had got to is still where the viewer went.
    const lifted = event.type === "pointerup" || (event.type === "pointercancel" && !!drag?.moved);
    const pinned = rosterPinned.value || nowPlayingPin.value !== null;
    if (!drag || !roster || !lifted) return pinned ? undefined : resumeFromScrub();
    let target = drag.time;
    if (!drag.moved) {
        // A tap: the frame under the finger, read off the strip's own scale.
        const box = rosterEl.value?.getBoundingClientRect();
        target = roster.time + (event.clientX - (box?.left ?? 0) - roster.markerX) / (roster.tileWidth / roster.step);
        target = Math.min(Math.max(0, target), Math.max(0, duration.value - 0.001));
    }
    handle.value?.seek(target);
    anchorPin(target);
    holdScrubAt(target);
    if (!pinned) resumeFromScrub();
}

const openMenu = ref<"speed" | "language" | "subtitles" | "sleep" | null>(null);
function toggleMenu(menu: "speed" | "language" | "subtitles" | "sleep") {
    openMenu.value = openMenu.value === menu ? null : menu;
}
function pickRate(rate: number) {
    controller.value?.setPlaybackRate(rate);
    openMenu.value = null;
}
function pickTrack(id: string) {
    controller.value?.setAudioTrack(id);
    openMenu.value = null;
}
function pickSubtitles(id: string | null) {
    controller.value?.setSubtitleTrack(id);
    openMenu.value = null;
}
const rateLabel = (rate: number) => `${rate}x`;

/** A wide screen: the player is the card in the corner, and a minimised video keeps only its picture. */
const desktopQuery = window.matchMedia("(min-width: 1024px)");
const isDesktop = ref(desktopQuery.matches);
/**
 * A phone gets the now-playing screen for sound and picture alike, full screen in portrait; a wide screen keeps
 * the card in the corner.
 */
const nowPlaying = computed(() => !isDesktop.value);
const onDesktopChange = (event: MediaQueryListEvent) => (isDesktop.value = event.matches);
desktopQuery.addEventListener("change", onDesktopChange);
onBeforeUnmount(() => desktopQuery.removeEventListener("change", onDesktopChange));
/**
 * On a wide screen a video that is minimised keeps only its picture, bottom right, with its controls
 * showing while the pointer is over it. Sound alone, and phones, keep the bar.
 */
const miniVideo = computed(
    () => isDesktop.value && !expanded.value && !!item.value && !!state.value && !audioMode.value,
);
function seekMini(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!rect.width || !(duration.value > 0) || !Number.isFinite(duration.value)) return;
    handle.value?.seek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * duration.value);
}

/** The sound alone wears the cover's colour over the whole player: pale in the light theme, dark in the dark one. */
const wash = computed(() => audioMode.value);

/**
 * The full-screen sound screen: the same component the web player shows, drawn here over the engine in use,
 * so the packaged app has it too. It sits over the whole page and hands back with its chevron or Escape.
 */
const audioFullscreen = ref(false);
const screenEl = ref<HTMLElement | null>(null);
/**
 * In a browser the screen takes the whole display, as a video's full screen does: it asks the browser for
 * it when it opens and gives it back when it closes. Leaving the browser's full screen by its own way (the
 * Escape key) closes the screen. The packaged app has no such request to make: its screen already fills
 * the web view.
 */
watch(audioFullscreen, async (open) => {
    if (isNativeApp()) return;
    if (open) {
        await nextTick();
        try {
            await screenEl.value?.requestFullscreen?.();
        } catch {
            /* refused (no gesture, or the browser has none): the screen still fills the window */
        }
    } else if (document.fullscreenElement && document.fullscreenElement === screenEl.value) {
        void document.exitFullscreen?.().catch(() => undefined);
    }
});
function onDocumentFullscreenChange() {
    if (audioFullscreen.value && screenEl.value && !document.fullscreenElement) {
        audioFullscreen.value = false;
    }
}
document.addEventListener("fullscreenchange", onDocumentFullscreenChange);
onBeforeUnmount(() => {
    document.removeEventListener("fullscreenchange", onDocumentFullscreenChange);
    if (document.fullscreenElement && document.fullscreenElement === screenEl.value) {
        void document.exitFullscreen?.().catch(() => undefined);
    }
});
const playerMessages = usePlayerMessages();
const screenMessages = computed(() => mergeMessages(playerMessages.value));
const coverBucketId = computed(() => content.value?.parentImageBucketId);
const { bucketBaseUrl: coverBucketBaseUrl } = useBucketInfo(coverBucketId);
/** The post's own cover, with the app's stand-in picture for a post without one or whose cover does not load. */
const screenArtwork = computed(() => {
    const src = content.value ? coverImageUrl(content.value, coverBucketBaseUrl.value) : undefined;
    const fallback = fallbackImageFor(content.value?.parentId);
    if (src) return { src, ...(fallback ? { fallback } : {}) };
    return fallback ? { src: fallback } : null;
});
const screenChapterIndex = computed(() => chapterIndexAt(chapters.value, currentTime.value));
const screenChapterMask = computed(() =>
    chapterMask(chapterSegments(chapters.value, duration.value)),
);
const screenTracks = computed(() =>
    (state.value?.audioTracks ?? []).map((track) => ({ id: track.id, label: track.label })),
);
// The screen is for the sound alone: back to the picture, or another item, and it closes.
watch([audioMode, () => item.value?.content._id], ([isAudio]) => {
    if (!isAudio) audioFullscreen.value = false;
});

const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60];
const sleepTimer = computed(() => state.value?.sleepTimer ?? null);

// --- the now-playing screen on a phone -----------------------------------------------------------

const nowPlayingWash = computed(() => thumbHashWash(content.value));
const nowPlayingSubtitle = computed(() =>
    [content.value?.author, publishDate.value].filter(Boolean).join(" · "),
);

/**
 * With sound alone the subtitles are the lyrics, read from the player where it can: a track has to be on for its
 * words to load, so one is turned on for the sound, in the post's language when there is one, and the viewer's
 * own choice is put back with the picture.
 */
const lyrics = computed(() => (audioMode.value ? (handle.value?.subtitleCues ?? []) : []));
let lyricsTrackSet = false;
watch(
    () => [audioMode.value, state.value?.subtitleTracks.length ?? 0] as const,
    ([audio, count]) => {
        const active = state.value?.activeSubtitleTrackId ?? null;
        if (audio && count > 0 && !active && !lyricsTrackSet) {
            const tracks = state.value!.subtitleTracks;
            const own = tracks.find((track) => track.lang === item.value?.language) ?? tracks[0]!;
            lyricsTrackSet = true;
            controller.value?.setSubtitleTrack(own.id);
        } else if (!audio && lyricsTrackSet) {
            lyricsTrackSet = false;
            controller.value?.setSubtitleTrack(null);
        }
    },
);
watch(
    () => item.value?.content._id,
    () => (lyricsTrackSet = false),
);

/** The screen is drawn down from its top line, as the card is from its handle. */
function onNowPlayingDragStart(event: PointerEvent) {
    if (!(event.target as Element | null)?.closest?.(".lmpl-afs-top")) return;
    onDragStart(event);
}
/** The minutes a minutes timer has left, rounded up, so it never says 0 while it runs. */
const sleepMinutesLeft = computed(() =>
    sleepTimer.value?.kind === "minutes"
        ? Math.max(1, Math.ceil((sleepTimer.value.endsAt - Date.now()) / 60_000))
        : null,
);
function pickSleep(option: { kind: "minutes"; minutes: number } | { kind: "chapter" } | null) {
    controller.value?.setSleepTimer(option);
    openMenu.value = null;
}
/** `m:ss`, or `h:mm:ss` past an hour. */
function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const whole = Math.floor(seconds);
    const h = Math.floor(whole / 3600);
    const m = Math.floor((whole % 3600) / 60);
    const s = String(whole % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const publishDate = computed(() =>
    content.value?.publishDate
        ? db.toDateTime(content.value.publishDate).toLocaleString(DateTime.DATE_MED)
        : "",
);

// Drawing the top of the player down moves it with the thumb. Let go far enough, or fast enough, and
// it slides away into the bar; short of that it springs back.
const playerDragY = ref(0);
const playerDragging = ref(false);
let dragStartY: number | null = null;
let dragLastY = 0;
let dragLastTime = 0;
let dragSpeed = 0;
/** A press that began on one of the bar's buttons: it is the button's until the thumb moves down. */
let dragFromButton = false;
let followQueued = false;
/**
 * The video the platform draws behind the page follows the page's own motion (a scroll, a transition),
 * which a drag is neither of: a resize is what makes it measure the picture area again.
 */
function nudgeInlineVideo() {
    if (followQueued) return;
    followQueued = true;
    requestAnimationFrame(() => {
        followQueued = false;
        window.dispatchEvent(new Event("resize"));
    });
}
function onDragStart(event: PointerEvent) {
    dragStartY = event.clientY;
    dragLastY = event.clientY;
    dragLastTime = event.timeStamp;
    dragSpeed = 0;
    // A press on a button stays the button's for a tap: capturing the pointer now would send its click
    // to this handle. The audio and video switch covers most of the bar, so a press there that moves
    // down still draws the player down.
    dragFromButton = !!(event.target as Element | null)?.closest?.(
        "button, a, input, select, textarea",
    );
    // The rest of the gesture is this handle's, wherever the thumb goes.
    if (!dragFromButton)
        (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
}
function onDragMove(event: PointerEvent) {
    if (dragStartY === null) return;
    if (dragFromButton) {
        if (event.clientY - dragStartY <= TAP_SLOP_PX) return;
        // Captured from here on, the release lands on this handle, so the button is not clicked.
        dragFromButton = false;
        dragStartY = event.clientY;
        dragLastY = event.clientY;
        (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
    }
    // A speed is read over a stretch long enough to mean something: two events a hair apart are not one.
    const elapsed = event.timeStamp - dragLastTime;
    if (elapsed >= MIN_SPEED_SAMPLE_MS) dragSpeed = (event.clientY - dragLastY) / elapsed;
    dragLastY = event.clientY;
    dragLastTime = event.timeStamp;
    playerDragY.value = Math.max(0, event.clientY - dragStartY);
    playerDragging.value = playerDragY.value > 0;
    if (playerDragging.value) nudgeInlineVideo();
}
function onDragEnd() {
    if (dragStartY === null) return;
    if (dragFromButton) {
        dragStartY = null;
        dragFromButton = false;
        return;
    }
    const moved = playerDragY.value;
    const away = letsGo(moved, dragSpeed, sectionEl.value?.offsetHeight || window.innerHeight);
    dragStartY = null;
    playerDragging.value = false;
    playerDragY.value = 0;
    // The inline position goes, and the class takes over: from where the thumb left it, the player
    // slides to the bar or back to its place, by the same transition as any other.
    if (away) minimiseMediaPlayer();
    nudgeInlineVideo();
}

/**
 * While the player is away from its place over the video the platform draws behind the page (drawn down,
 * or on its way back), the page behind it is hidden, and the strip it leaves above the player would show
 * that video's black. The page shows through that strip alone (see main.css), as it will when the player
 * has gone. The strip is as tall as the player is displaced: the pull while the thumb is down, the
 * player's own position as it springs back.
 */
let gapFrame = 0;
function endGap() {
    cancelAnimationFrame(gapFrame);
    document.documentElement.classList.remove("lmc-player-dragging");
}
function followGap() {
    cancelAnimationFrame(gapFrame);
    const step = () => {
        const section = sectionEl.value;
        if (!section || !inlineHole.value) return endGap();
        const gap = playerDragging.value
            ? playerDragY.value
            : Math.max(0, section.getBoundingClientRect().top);
        const root = document.documentElement;
        root.classList.add("lmc-player-dragging");
        root.style.setProperty("--lmc-gap-top", "0px");
        root.style.setProperty("--lmc-gap-bottom", `${Math.max(0, window.innerHeight - gap)}px`);
        if (playerDragging.value || gap > 0.5) gapFrame = requestAnimationFrame(step);
        else endGap();
    };
    step();
}
watch(playerDragging, (dragging) => {
    if (dragging && inlineHole.value) followGap();
});
onBeforeUnmount(endGap);

const VOLUME_STEP = 0.1;
const { isSearchOpen } = useSearchOverlay();
let lastSubtitleId: string | null = null;
watch(
    () => state.value?.activeSubtitleTrackId,
    (id) => {
        if (id) lastSubtitleId = id;
    },
);
function isBrowserFullscreen() {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return !!(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}
// A phone has no keyboard to speak of, and its player is native.
useMediaPlayerShortcuts(
    () => !isNativeApp() && !!item.value && !!content.value,
    () => isSearchOpen.value || !!document.querySelector('[aria-modal="true"]'),
    {
        togglePlay: () => togglePlay(),
        skip: ({ seconds }) => skip(seconds),
        seekToFraction: ({ fraction }) => {
            if (!(duration.value > 0) || !Number.isFinite(duration.value)) return;
            handle.value?.seek(Math.min(fraction * duration.value, Math.max(0, duration.value - 0.001)));
        },
        volume: ({ direction }) => {
            const player = handle.value;
            if (!player?.setVolume) return;
            // Raising the volume of a muted player unmutes it, as the player's own plus button does.
            if (direction === 1 && muted.value) player.setMuted?.(false);
            const next = Math.round(((player.volume ?? 1) + direction * VOLUME_STEP) * 10) / 10;
            player.setVolume(Math.min(1, Math.max(0, next)));
        },
        toggleMute: () => handle.value?.setMuted?.(!muted.value),
        toggleFullscreen: () => {
            if (audioMode.value) audioFullscreen.value = !audioFullscreen.value;
            else if (isBrowserFullscreen()) void handle.value?.exitFullscreen();
            else void handle.value?.enterFullscreen();
        },
        toggleSubtitles: () => {
            const tracks = state.value?.subtitleTracks ?? [];
            if (!tracks.length) return;
            if (state.value?.activeSubtitleTrackId) return void controller.value?.setSubtitleTrack(null);
            const again = tracks.find((track) => track.id === lastSubtitleId);
            controller.value?.setSubtitleTrack((again ?? tracks[0]).id);
        },
        rate: ({ direction }) => {
            const current = state.value?.playbackRate ?? 1;
            const next =
                direction === 1 ? RATES.find((r) => r > current) : [...RATES].reverse().find((r) => r < current);
            if (next !== undefined) controller.value?.setPlaybackRate(next);
        },
        next: () => {
            const next = nextContents.value[0];
            if (!next) return;
            // In full-screen the next video takes the player and carries on there, as choosing it there does.
            if (isBrowserFullscreen()) swapToNext(next._id);
            else playNext(next);
        },
    },
);

function onKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    // An open sheet is closed first; a second press minimises the player.
    if (sheetTab.value) closeSheet();
    else minimiseMediaPlayer();
}
</script>

<template>
    <template v-if="item && content">
        <section
            role="dialog"
            :aria-label="content.title"
            :aria-hidden="!expanded && !miniVideo"
            class="fixed inset-0 z-[60] flex flex-col overflow-hidden transition-transform duration-300 ease-out lg:inset-auto lg:bottom-5 lg:right-5 lg:max-h-[90vh] lg:shadow-2xl lg:shadow-black/20"
            :class="[
                expanded || miniVideo ? 'translate-y-0' : 'pointer-events-none translate-y-[110vh]',
                miniVideo ? 'lg:w-96 lg:rounded-xl' : 'lg:w-96 lg:rounded-2xl',
            ]"
            :style="{
                ...(playerDragging
                    ? { '--tw-translate-y': `${playerDragY}px`, transition: 'none' }
                    : {}),
            }"
            ref="sectionEl"
            data-test="mediaPlayer"
            @keydown="onKeydown"
        >
            <!-- A phone: the now-playing screen, for sound and picture alike. The engine plays in its stage. -->
            <div
                v-if="nowPlaying"
                class="lmpl-root [&_.lmpl-afs-top]:touch-none"
                style="position: absolute; inset: 0; width: 100%; height: 100%; aspect-ratio: auto"
                data-test="mediaPlayerNowPlaying"
                @pointerdown="onNowPlayingDragStart"
                @pointermove="onDragMove"
                @pointerup="onDragEnd"
                @pointercancel="onDragEnd"
            >
                <AudioFullscreen
                    :title="content.title"
                    :subtitle="nowPlayingSubtitle"
                    :artwork="screenArtwork"
                    :wash="nowPlayingWash"
                    appearance="dark"
                    :stage="audioMode ? 'cover' : 'video'"
                    :stage-hole="inlineHole"
                    :exit-label="t('media_player.minimise')"
                    :chapters="chapters"
                    :current-time="currentTime"
                    :duration="duration"
                    :buffered-end="state?.bufferedEnd ?? 0"
                    :playing="playing"
                    :live="live"
                    :chapter-index="screenChapterIndex"
                    :playback-rate="state?.playbackRate ?? 1"
                    :audio-tracks="screenTracks"
                    :active-audio-track-id="state?.activeAudioTrackId ?? null"
                    :sleep-timer="sleepTimer"
                    :has-browse="chapters.length > 0 || nextUp.length > 0"
                    :up-next="nextUp"
                    chapters-sheet
                    :skip-back-seconds="SKIP_SECONDS"
                    :skip-forward-seconds="SKIP_SECONDS"
                    :chapter-mask="screenChapterMask"
                    :messages="screenMessages"
                    :subtitle-tracks="state?.subtitleTracks ?? []"
                    :active-subtitle-track-id="state?.activeSubtitleTrackId ?? null"
                    :can-picture-in-picture="!!handle?.canPictureInPicture"
                    :lyrics="lyrics"
                    @exit="minimiseMediaPlayer"
                    @toggle-play="togglePlay"
                    @seek="(time) => handle?.seek(time)"
                    @seek-chapter="(chapter) => handle?.seek(chapter.startTime)"
                    @upnextselect="
                        (id) => {
                            const next = nextContents.find((doc) => doc._id === id);
                            if (next) playNext(next);
                        }
                    "
                    @rate="(rate) => controller?.setPlaybackRate(rate)"
                    @audio-track="(id) => controller?.setAudioTrack(id)"
                    @sleep="(option) => controller?.setSleepTimer(option)"
                    @subtitle-track="(id) => controller?.setSubtitleTrack(id)"
                    @picture-in-picture="handle?.startPictureInPicture?.()"
                    @fullscreen="handle?.enterFullscreen()"
                    @stagechange="nudgeInlineVideo"
                    @scrub="onNowPlayingScrub"
                >
                    <template v-if="nowPlayingRoster" #roster>
                        <ScrubRoster
                            :tiles="nowPlayingRoster.tiles"
                            :tile-width="nowPlayingRoster.tileWidth"
                            :height="nowPlayingRoster.height"
                            :marker-x="nowPlayingRoster.markerX"
                            :bottom="nowPlayingRoster.bottom"
                            :interactive="!nowPlayingScrub"
                            :ref="(el) => (rosterEl = ((el as any)?.$el as HTMLElement) ?? null)"
                            data-test="mediaPlayerNowPlayingRoster"
                            @pointerdown.stop="!nowPlayingScrub && onRosterDown($event)"
                            @pointermove.stop="!nowPlayingScrub && onRosterMove($event)"
                            @pointerup.stop="!nowPlayingScrub && onRosterUp($event)"
                            @pointercancel.stop="!nowPlayingScrub && onRosterUp($event)"
                        />
                    </template>
                    <template #top-end>
                        <button
                            v-if="handle?.airPlayAvailable || handle?.castAvailable"
                            type="button"
                            class="lmpl-afs-iconbtn"
                            :aria-label="t(isMac ? 'media_player.airplay' : 'media_player.cast')"
                            data-test="mediaPlayerNowPlayingCast"
                            @click="
                                handle?.airPlayAvailable
                                    ? handle.showAirPlayPicker?.()
                                    : handle?.showCastPicker?.()
                            "
                        >
                            <V10Icon
                                :name="isMac ? 'airplay' : 'cast'"
                                class="h-[22px] w-[22px]"
                            />
                        </button>
                        <div
                            v-if="canSwitch"
                            role="group"
                            :aria-label="t('media_player.play_as')"
                            class="flex min-w-0 rounded-full bg-white/10 p-1"
                        >
                            <button
                                type="button"
                                class="flex h-8 min-w-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold"
                                :class="audioMode ? 'bg-white text-zinc-900' : 'text-white/75'"
                                :aria-pressed="audioMode"
                                data-test="mediaPlayerAudio"
                                @click="showAudio"
                            >
                                <MusicalNoteIcon class="h-4 w-4" />
                                <span class="truncate">{{ t("media_player.audio") }}</span>
                            </button>
                            <button
                                type="button"
                                class="flex h-8 min-w-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold"
                                :class="!audioMode ? 'bg-white text-zinc-900' : 'text-white/75'"
                                :aria-pressed="!audioMode"
                                data-test="mediaPlayerVideo"
                                @click="showVideo"
                            >
                                <FilmIcon class="h-4 w-4" />
                                <span class="truncate">{{ t("media_player.video") }}</span>
                            </button>
                        </div>
                    </template>
                    <template #stage>
                        <VideoPlayer
                            ref="engine"
                            :content="content"
                            :language="item.language"
                            :start-audio="startAudio"
                            :next-up="nextUp"
                            autoplay
                            @nextupselect="swapToNext"
                            inline
                            :fullscreen-on-play="isNativeApp()"
                        />
                    </template>
                </AudioFullscreen>
            </div>

            <!-- The cover, blurred and saturated, behind every part, under a scrim to keep the text readable. -->
            <div
                v-if="!nowPlaying && wash"
                class="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-amber-50 dark:bg-slate-900"
                aria-hidden="true"
                data-test="mediaPlayerWash"
            >
                <div class="absolute -inset-[20%] opacity-70 blur-3xl saturate-150 dark:opacity-60">
                    <LImage
                        :image="content.parentImageData"
                        :content-parent-id="content.parentId"
                        :parent-image-bucket-id="content.parentImageBucketId"
                        aspectRatio="square"
                        size="post"
                        :rounded="false"
                    />
                </div>
                <div class="absolute inset-0 bg-white/45 dark:bg-slate-900/65" />
            </div>
            <div
                v-if="!nowPlaying"
                v-show="!miniVideo"
                class="flex-none touch-none bg-amber-50 dark:bg-slate-800 max-lg:pt-[env(safe-area-inset-top)]"
                :class="{ '!bg-transparent': wash }"
                data-test="mediaPlayerHandle"
                @pointerdown="onDragStart"
                @pointermove="onDragMove"
                @pointerup="onDragEnd"
                @pointercancel="onDragEnd"
            >
                <!-- The grabber sits in the row's top padding, which matches the bottom one, so the row's
                     buttons are in the middle of the bar rather than pushed down under the grabber. -->
                <div
                    class="relative flex items-center justify-between px-4 py-5 lg:py-3 [@media(max-height:840px)]:py-4"
                >
                    <div
                        class="pointer-events-none absolute inset-x-0 top-2 flex justify-center lg:hidden [@media(max-height:840px)]:top-1.5"
                        aria-hidden="true"
                    >
                        <div
                            class="h-1.5 w-32 rounded-full bg-zinc-400 opacity-50 dark:bg-slate-400"
                        />
                    </div>
                    <button
                        type="button"
                        class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                        :aria-label="t('media_player.minimise')"
                        data-test="mediaPlayerMinimise"
                        @click="minimiseMediaPlayer"
                    >
                        <ChevronDownIcon class="h-8 w-8 text-zinc-500 dark:text-slate-400" />
                    </button>

                    <div
                        v-if="canSwitch"
                        role="group"
                        :aria-label="t('media_player.play_as')"
                        class="flex min-w-0 rounded-full bg-zinc-500/15 p-1"
                    >
                        <button
                            type="button"
                            class="flex h-9 min-w-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
                            :class="
                                audioMode
                                    ? 'bg-zinc-700 text-white dark:bg-slate-200 dark:text-slate-900'
                                    : 'text-zinc-600 dark:text-slate-300'
                            "
                            :aria-pressed="audioMode"
                            data-test="mediaPlayerAudio"
                            @click="showAudio"
                        >
                            <MusicalNoteIcon class="h-4 w-4" />
                            <span class="truncate">{{ t("media_player.audio") }}</span>
                        </button>
                        <button
                            type="button"
                            class="flex h-9 min-w-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
                            :class="
                                !audioMode
                                    ? 'bg-zinc-700 text-white dark:bg-slate-200 dark:text-slate-900'
                                    : 'text-zinc-600 dark:text-slate-300'
                            "
                            :aria-pressed="!audioMode"
                            data-test="mediaPlayerVideo"
                            @click="showVideo"
                        >
                            <FilmIcon class="h-4 w-4" />
                            <span class="truncate">{{ t("media_player.video") }}</span>
                        </button>
                    </div>

                    <button
                        type="button"
                        class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                        :aria-label="t('media_player.close')"
                        data-test="mediaPlayerClose"
                        @click="closeMediaPlayer"
                    >
                        <XMarkIcon class="h-7 w-7 text-zinc-500 dark:text-slate-400" />
                    </button>
                </div>
            </div>

            <div
                v-if="!nowPlaying"
                ref="pictureEl"
                class="relative w-full flex-none touch-pan-y"
                :class="
                    audioMode
                        ? 'overflow-hidden py-4 lg:aspect-video lg:py-0'
                        : ['aspect-video', inlineHole ? 'bg-transparent' : 'bg-black']
                "
                @pointerdown="onPictureDown"
                @pointermove="onPictureMove"
                @pointerup="onPictureUp"
                @pointercancel="onPictureUp"
            >
                <div
                    v-show="!audioMode"
                    class="absolute inset-0"
                >
                    <VideoPlayer
                        ref="engine"
                        :content="content"
                        :language="item.language"
                        :start-audio="startAudio"
                        :next-up="nextUp"
                        autoplay
                        @nextupselect="swapToNext"
                        inline
                        :fullscreen-on-play="isNativeApp()"
                    />
                </div>

                <!-- Minimised on a wide screen: the picture alone; pointing at it brings its controls, a press expands. -->
                <div
                    v-if="miniVideo"
                    class="group absolute inset-0 z-10 cursor-pointer"
                    data-test="mediaPlayerMiniVideo"
                    @click="expandMediaPlayer"
                >
                    <div
                        class="absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/55 via-transparent to-black/70 p-2 text-white opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                    >
                        <div class="flex justify-end gap-1">
                            <V10Button
                                round
                                class="h-9 w-9"
                                :label="t('media_player.expand')"
                                data-test="mediaPlayerMiniExpand"
                                @click.stop="expandMediaPlayer"
                            >
                                <ArrowsPointingOutIcon class="h-4 w-4" />
                            </V10Button>
                            <V10Button
                                round
                                class="h-9 w-9"
                                :label="t('media_player.close')"
                                data-test="mediaPlayerMiniClose"
                                @click.stop="closeMediaPlayer"
                            >
                                <XMarkIcon class="h-4 w-4" />
                            </V10Button>
                        </div>
                        <div class="flex items-center justify-center gap-4">
                            <V10Button
                                v-if="!live"
                                round
                                class="h-10 w-10"
                                :label="t('media_player.skip_back', { seconds: SKIP_SECONDS })"
                                data-test="mediaPlayerMiniBack"
                                @click.stop="skip(-SKIP_SECONDS)"
                            >
                                <V10Icon
                                    :skip="{ seconds: SKIP_SECONDS, direction: 'back' }"
                                    class="h-6 w-6"
                                />
                            </V10Button>
                            <V10Button
                                round
                                class="h-14 w-14"
                                :label="playing ? t('media_player.pause') : t('media_player.play')"
                                data-test="mediaPlayerMiniPlay"
                                @click.stop="togglePlay"
                            >
                                <V10Icon
                                    v-if="playing"
                                    name="pause"
                                    class="h-7 w-7"
                                />
                                <V10Icon
                                    v-else
                                    name="play"
                                    class="h-7 w-7 translate-x-[8%]"
                                />
                            </V10Button>
                            <V10Button
                                v-if="!live"
                                round
                                class="h-10 w-10"
                                :label="t('media_player.skip_forward', { seconds: SKIP_SECONDS })"
                                data-test="mediaPlayerMiniForward"
                                @click.stop="skip(SKIP_SECONDS)"
                            >
                                <V10Icon
                                    :skip="{ seconds: SKIP_SECONDS, direction: 'forward' }"
                                    class="h-6 w-6"
                                />
                            </V10Button>
                        </div>
                        <div
                            v-if="live"
                            class="flex justify-center"
                            data-test="mediaPlayerMiniLive"
                        >
                            <span
                                class="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
                            >
                                <span
                                    class="h-1.5 w-1.5 rounded-full bg-white"
                                    aria-hidden="true"
                                />
                                {{ t("media_player.live") }}
                            </span>
                        </div>
                        <div
                            v-else
                            class="flex flex-col gap-1"
                        >
                            <div
                                class="h-1.5 cursor-pointer rounded-full bg-white/35"
                                role="presentation"
                                data-test="mediaPlayerMiniSeek"
                                @click.stop="seekMini"
                            >
                                <div
                                    class="h-full rounded-full bg-yellow-500"
                                    :style="{ width: `${progress * 100}%` }"
                                />
                            </div>
                            <div class="flex justify-between text-[10px] tabular-nums">
                                <span>{{ formatTime(currentTime) }}</span>
                                <span>-{{ formatTime(Math.max(0, duration - currentTime)) }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- The frames around the dot while it is dragged, over the foot of the picture as in
                     full-screen; the picture is as wide as the bar's row, so one marker position serves both. -->
                <div
                    v-if="heldRoster"
                    ref="rosterEl"
                    class="absolute inset-x-0 bottom-0 z-10"
                    :class="rosterPinned ? 'pointer-events-auto touch-none' : 'pointer-events-none'"
                    :style="{ height: `${rosterHeight}px` }"
                    data-test="mediaPlayerRoster"
                    @pointerdown.stop="rosterPinned && onRosterDown($event)"
                    @pointermove.stop="rosterPinned && onRosterMove($event)"
                    @pointerup.stop="rosterPinned && onRosterUp($event)"
                    @pointercancel.stop="rosterPinned && onRosterUp($event)"
                >
                    <ScrubRoster
                        :tiles="heldRoster.tiles"
                        :tile-width="heldRoster.tileWidth"
                        :height="rosterHeight"
                        :marker-x="heldRoster.markerX"
                        :bottom="0"
                    />
                </div>

                <div
                    v-if="starting && !audioMode"
                    class="pointer-events-none absolute inset-0 bg-black"
                    data-test="mediaPlayerPoster"
                >
                    <LImage
                        :image="content.parentImageData"
                        :content-parent-id="content.parentId"
                        :parent-image-bucket-id="content.parentImageBucketId"
                        aspectRatio="video"
                        size="post"
                        class="h-full w-full object-cover opacity-70"
                    />
                </div>

                <div
                    v-if="(starting || stalled) && !audioMode"
                    class="pointer-events-none absolute inset-0 flex items-center justify-center"
                    role="status"
                    :aria-label="t('video_player.loading')"
                    :data-test="starting ? 'mediaPlayerStarting' : 'mediaPlayerStalled'"
                >
                    <span
                        class="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white"
                        aria-hidden="true"
                    />
                </div>

                <div
                    v-if="audioMode"
                    class="relative flex w-full items-center justify-center lg:h-full"
                    data-test="mediaPlayerArtwork"
                >
                    <!-- On a wide screen the band is the picture's own height (16:9), so the card is as tall in the sound
                         alone as with the video, and the cover fits it. -->
                    <div
                        class="relative w-[min(66%,236px,26svh)] lg:aspect-square lg:h-[calc(100%-2rem)] lg:w-auto"
                    >
                        <div class="relative overflow-hidden rounded-xl shadow-xl">
                            <LImage
                                :image="content.parentImageData"
                                :content-parent-id="content.parentId"
                                :parent-image-bucket-id="content.parentImageBucketId"
                                aspectRatio="square"
                                size="post"
                                :rounded="false"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Nothing here scrolls: the room between the parts gives way on a short screen, and the sheets
                 (Chapters, Up next) scroll inside themselves. Nothing is clipped either: the menus open
                 upward over the picture. -->
            <div
                v-if="!nowPlaying"
                v-show="!miniVideo"
                class="flex min-h-0 flex-1 flex-col overflow-visible bg-amber-50 dark:bg-slate-800"
                :class="{ '!bg-transparent': wash }"
                data-test="mediaPlayerScroll"
            >
                <div
                    class="max-h-10 min-h-0 flex-shrink flex-grow basis-6"
                    aria-hidden="true"
                />
                <div class="flex-none space-y-1 px-6 text-center">
                    <span
                        v-if="content.author"
                        class="block truncate text-xs font-semibold uppercase tracking-[0.1rem] text-yellow-600"
                        >{{ content.author }}</span
                    >
                    <span
                        class="block truncate text-lg font-bold text-zinc-600 dark:text-slate-300"
                        >{{ content.title }}</span
                    >
                    <span
                        v-if="publishDate"
                        class="block truncate text-xs font-semibold text-zinc-400"
                        >{{ publishDate }}</span
                    >
                </div>

                <template v-if="state">
                    <div
                        class="max-h-10 min-h-0 flex-shrink flex-grow basis-8"
                        aria-hidden="true"
                    />
                    <div
                        class="relative flex flex-none flex-wrap items-center justify-center gap-y-2 px-3"
                        data-test="mediaPlayerControls"
                        :class="[
                            // Nothing to press yet: out of sight, but keeping its room, so the page does not move.
                            { invisible: starting },
                            // A seventh button: tighter, so the row still fits a 390 pt phone.
                            handle?.airPlayAvailable ? 'gap-1 md:gap-2' : 'gap-2 md:gap-3',
                        ]"
                    >
                        <div
                            v-if="state.audioTracks.length > 1"
                            class="relative flex-shrink-0"
                        >
                            <button
                                type="button"
                                class="relative flex h-10 w-10 items-center justify-center rounded-full border border-zinc-500/35 text-zinc-600 after:absolute after:-inset-0.5 after:content-[''] dark:text-slate-300 min-[420px]:h-11 min-[420px]:w-11 min-[420px]:after:inset-0 md:h-12 md:w-12"
                                :aria-label="t('media_player.language')"
                                :aria-expanded="openMenu === 'language'"
                                @click="toggleMenu('language')"
                            >
                                <V10Icon
                                    name="language"
                                    class="h-5 w-5 md:h-6 md:w-6"
                                />
                            </button>
                            <MediaPlayerMenu
                                v-if="openMenu === 'language'"
                                :title="t('media_player.language')"
                            >
                                <MediaPlayerMenuItem
                                    v-for="track in state.audioTracks"
                                    :key="track.id"
                                    :label="track.label"
                                    :selected="track.id === state.activeAudioTrackId"
                                    @pick="pickTrack(track.id)"
                                />
                            </MediaPlayerMenu>
                        </div>
                        <div
                            v-if="!live && timeKnown"
                            class="relative flex-shrink-0"
                        >
                            <button
                                type="button"
                                class="relative flex h-10 items-center justify-center rounded-full border border-zinc-500/35 text-sm font-semibold text-zinc-600 after:absolute after:-inset-0.5 after:content-[''] dark:text-slate-300 min-[420px]:h-11 min-[420px]:after:inset-0 md:h-12"
                                :class="
                                    state.playbackRate === 1
                                        ? 'w-10 min-[420px]:w-11 md:w-12'
                                        : 'px-2 md:px-3'
                                "
                                :aria-label="t('media_player.speed')"
                                :aria-description="rateLabel(state.playbackRate)"
                                :aria-expanded="openMenu === 'speed'"
                                @click="toggleMenu('speed')"
                            >
                                <span class="flex items-center gap-1.5">
                                    <V10Icon
                                        name="speed"
                                        class="h-5 w-5 md:h-6 md:w-6"
                                    />
                                    <!-- The rate is said only when it is not the normal one: a settled choice needs no label. -->
                                    <template v-if="state.playbackRate !== 1">{{
                                        rateLabel(state.playbackRate)
                                    }}</template>
                                </span>
                            </button>
                            <MediaPlayerMenu
                                v-if="openMenu === 'speed'"
                                :title="t('media_player.speed')"
                            >
                                <MediaPlayerMenuItem
                                    v-for="rate in [...RATES].reverse()"
                                    :key="rate"
                                    :label="rateLabel(rate)"
                                    :selected="rate === state.playbackRate"
                                    @pick="pickRate(rate)"
                                />
                            </MediaPlayerMenu>
                        </div>
                        <div
                            v-if="audioMode"
                            class="relative flex-shrink-0"
                        >
                            <button
                                type="button"
                                class="relative flex h-10 items-center justify-center gap-1.5 rounded-full border border-zinc-500/35 text-sm font-semibold text-zinc-600 after:absolute after:-inset-0.5 after:content-[''] dark:text-slate-300 min-[420px]:h-11 min-[420px]:after:inset-0 md:h-12"
                                :class="[
                                    sleepTimer ? 'px-2 text-yellow-700 dark:text-yellow-400' : 'w-10 min-[420px]:w-11 md:w-12',
                                    { 'bg-zinc-500/15': sleepTimer },
                                ]"
                                :aria-label="t('media_player.sleep_timer')"
                                :aria-expanded="openMenu === 'sleep'"
                                data-test="mediaPlayerSleep"
                                @click="toggleMenu('sleep')"
                            >
                                <MoonIcon class="h-5 w-5 md:h-6 md:w-6" />
                                <span
                                    v-if="sleepMinutesLeft !== null"
                                    data-test="mediaPlayerSleepCaption"
                                    >{{
                                        t("media_player.sleep_left", { minutes: sleepMinutesLeft })
                                    }}</span
                                >
                                <span
                                    v-else-if="sleepTimer"
                                    data-test="mediaPlayerSleepCaption"
                                    >{{ t("media_player.sleep_end_of_chapter") }}</span
                                >
                            </button>
                            <MediaPlayerMenu
                                v-if="openMenu === 'sleep'"
                                :title="t('media_player.sleep_timer')"
                            >
                                <MediaPlayerMenuItem
                                    :label="t('media_player.sleep_off')"
                                    :selected="!sleepTimer"
                                    data-test="mediaPlayerSleepOff"
                                    @pick="pickSleep(null)"
                                />
                                <MediaPlayerMenuItem
                                    v-for="minutes in SLEEP_MINUTES"
                                    :key="minutes"
                                    :label="t('media_player.sleep_minutes', { minutes })"
                                    :selected="
                                        sleepTimer?.kind === 'minutes' &&
                                        sleepMinutesLeft !== null &&
                                        Math.abs(sleepMinutesLeft - minutes) < 1
                                    "
                                    :data-test="`mediaPlayerSleep${minutes}`"
                                    @pick="pickSleep({ kind: 'minutes', minutes })"
                                />
                                <MediaPlayerMenuItem
                                    v-if="chapters.length"
                                    :label="t('media_player.sleep_end_of_chapter')"
                                    :selected="sleepTimer?.kind === 'chapter'"
                                    data-test="mediaPlayerSleepChapter"
                                    @pick="pickSleep({ kind: 'chapter' })"
                                />
                            </MediaPlayerMenu>
                        </div>
                        <template v-if="!audioMode">
                            <div
                                v-if="state.subtitleTracks.length > 0"
                                class="relative flex-shrink-0"
                            >
                                <button
                                    type="button"
                                    class="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-500/35 text-zinc-600 disabled:opacity-40 dark:text-slate-300"
                                    :class="{ 'bg-zinc-500/15': state.activeSubtitleTrackId }"
                                    :aria-label="t('media_player.subtitles')"
                                    :aria-expanded="openMenu === 'subtitles'"
                                    data-test="mediaPlayerSubtitles"
                                    @click="toggleMenu('subtitles')"
                                >
                                    <V10Icon
                                        :name="
                                            state.activeSubtitleTrackId ? 'captionsOn' : 'captions'
                                        "
                                        class="h-5 w-5 md:h-6 md:w-6"
                                    />
                                </button>
                                <MediaPlayerMenu
                                    v-if="openMenu === 'subtitles'"
                                    :title="t('media_player.subtitles')"
                                >
                                    <MediaPlayerMenuItem
                                        :label="t('media_player.subtitles_off')"
                                        :selected="!state.activeSubtitleTrackId"
                                        @pick="pickSubtitles(null)"
                                    />
                                    <MediaPlayerMenuItem
                                        v-for="track in state.subtitleTracks"
                                        :key="track.id"
                                        :label="track.label"
                                        :selected="track.id === state.activeSubtitleTrackId"
                                        @pick="pickSubtitles(track.id)"
                                    />
                                </MediaPlayerMenu>
                            </div>

                            <button
                                v-if="handle?.canPictureInPicture"
                                type="button"
                                class="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-zinc-500/35 text-zinc-600 after:absolute after:-inset-0.5 after:content-[''] disabled:opacity-40 dark:text-slate-300 min-[420px]:h-11 min-[420px]:w-11 min-[420px]:after:inset-0 md:h-12 md:w-12"
                                :aria-label="t('media_player.picture_in_picture')"
                                data-test="mediaPlayerPictureInPicture"
                                @click="handle?.startPictureInPicture?.()"
                            >
                                <V10Icon
                                    name="pip"
                                    class="h-5 w-5 md:h-6 md:w-6"
                                />
                            </button>
                        </template>
                        <button
                            v-if="handle?.airPlayAvailable"
                            type="button"
                            class="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-zinc-500/35 text-zinc-600 after:absolute after:-inset-0.5 after:content-[''] dark:text-slate-300 min-[420px]:h-11 min-[420px]:w-11 min-[420px]:after:inset-0 md:h-12 md:w-12"
                            :class="{
                                'bg-zinc-500/15 text-yellow-700 dark:text-yellow-400':
                                    handle?.airPlayActive,
                            }"
                            :aria-label="t(isMac ? 'media_player.airplay' : 'media_player.cast')"
                            :aria-pressed="handle?.airPlayActive === true"
                            data-test="mediaPlayerAirPlay"
                            @click="handle?.showAirPlayPicker?.()"
                        >
                            <V10Icon
                                :name="isMac ? 'airplay' : 'cast'"
                                class="h-5 w-5 md:h-6 md:w-6"
                            />
                        </button>
                        <button
                            v-if="handle?.canMute"
                            type="button"
                            class="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-zinc-500/35 text-zinc-600 after:absolute after:-inset-0.5 after:content-[''] disabled:opacity-40 dark:text-slate-300 min-[420px]:h-11 min-[420px]:w-11 min-[420px]:after:inset-0 md:h-12 md:w-12"
                            :aria-label="muted ? t('media_player.unmute') : t('media_player.mute')"
                            :aria-pressed="muted"
                            data-test="mediaPlayerMute"
                            @click="handle?.setMuted?.(!muted)"
                        >
                            <V10Icon
                                :name="muted ? 'volumeOff' : 'volumeHigh'"
                                class="h-5 w-5 md:h-6 md:w-6"
                            />
                        </button>
                        <button
                            type="button"
                            class="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-zinc-500/35 text-zinc-600 after:absolute after:-inset-0.5 after:content-[''] dark:text-slate-300 min-[420px]:h-11 min-[420px]:w-11 min-[420px]:after:inset-0 md:h-12 md:w-12"
                            :aria-label="t('media_player.fullscreen')"
                            data-test="mediaPlayerFullscreen"
                            @click="audioMode ? (audioFullscreen = true) : handle?.enterFullscreen()"
                        >
                            <V10Icon
                                name="fullscreenEnter"
                                class="h-5 w-5 md:h-6 md:w-6"
                            />
                        </button>

                        <!-- A tap anywhere else closes the menu. -->
                        <div
                            v-if="openMenu"
                            class="fixed inset-0 z-[9]"
                            aria-hidden="true"
                            data-test="mediaPlayerMenuBackdrop"
                            @click="openMenu = null"
                        />
                    </div>

                    <!-- Inset from the screen edge on purpose: a thumb at either end of the bar would sit
                         where Android's back gesture and iOS's edge swipe are read, and a drag to the
                         end would navigate away instead of seeking. -->
                    <!-- The same room for every kind of media, so the play button does not move when a stream
                         turns out to be live: a recorded video has its bar here, a live one says so. -->
                    <div
                        class="max-h-10 min-h-0 flex-shrink flex-grow basis-5"
                        aria-hidden="true"
                    />
                    <div
                        ref="seekArea"
                        class="relative flex-none"
                    >
                        <div
                            class="flex flex-col px-10"
                            :class="{ invisible: !timeKnown || live }"
                            data-test="mediaPlayerSeekBar"
                        >
                            <!-- The drawn bar shows what has played and what is loaded; the range on top of it
                             is what takes the touch, with only its thumb showing. -->
                            <!-- 44 px tall to take a thumb, laid out as the 20 px bar it was (the negative margin). -->
                            <div class="relative -my-3 flex h-11 items-center">
                                <!-- The time at the dot while it is dragged: the finger covers it, so it sits above. -->
                                <span
                                    v-if="scrubTime !== null"
                                    class="pointer-events-none absolute -top-5 z-10 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold tabular-nums text-white shadow-lg ring-1 ring-white/10"
                                    :style="{ left: `calc(8px + (100% - 16px) * ${progress})` }"
                                    data-test="mediaPlayerScrubTime"
                                    >{{ formatTime(scrubTime) }}</span
                                >
                                <div
                                    class="absolute inset-x-0 overflow-hidden rounded-full bg-black/10 transition-[height] duration-150 dark:bg-white/15"
                                    :class="scrubTime !== null ? 'h-3' : 'h-2'"
                                    aria-hidden="true"
                                >
                                    <div
                                        v-if="loadedShows"
                                        class="absolute inset-y-0 left-0 rounded-full bg-black/40 transition-[width] duration-300 dark:bg-white/50"
                                        :style="{ width: `${loaded * 100}%` }"
                                        data-test="mediaPlayerLoaded"
                                    />
                                    <div
                                        class="absolute inset-y-0 left-0 rounded-l-full bg-yellow-500"
                                        :class="{ 'rounded-r-full': !loadedShows }"
                                        :style="{ width: `${progress * 100}%` }"
                                    />
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    :max="duration || 0"
                                    step="1"
                                    :value="shownTime"
                                    :aria-label="t('media_player.seek')"
                                    class="relative h-11 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-yellow-500 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-800 [&::-webkit-slider-thumb]:shadow-md dark:[&::-webkit-slider-thumb]:bg-white"
                                    :class="
                                        scrubTime !== null
                                            ? '[&::-moz-range-thumb]:opacity-100 [&::-webkit-slider-thumb]:opacity-100'
                                            : '[&::-moz-range-thumb]:opacity-0 [&::-webkit-slider-thumb]:opacity-0'
                                    "
                                    data-test="mediaPlayerSeek"
                                    @input="scrub"
                                    @change="seekTo"
                                    @pointercancel="cancelScrub"
                                />
                            </div>
                            <div
                                class="mt-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-300"
                            >
                                <span>{{ timeRow.elapsed }}</span>
                                <span>{{ timeRow.remaining }}</span>
                            </div>
                        </div>
                        <div
                            v-if="live"
                            class="absolute inset-0 flex items-center justify-center"
                            data-test="mediaPlayerLive"
                        >
                            <span
                                class="inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white"
                            >
                                <span
                                    class="h-2 w-2 rounded-full bg-white"
                                    aria-hidden="true"
                                />
                                {{ t("media_player.live") }}
                            </span>
                        </div>
                    </div>

                    <div class="flex flex-none items-center justify-center gap-8">
                        <V10Button
                            round
                            class="h-14 w-14 [@media(max-height:840px)]:h-12 [@media(max-height:840px)]:w-12"
                            :class="{ invisible: !timeKnown || live }"
                            :label="t('media_player.skip_back', { seconds: SKIP_SECONDS })"
                            data-test="mediaPlayerSkipBack"
                            @click="skip(-SKIP_SECONDS)"
                        >
                            <V10Icon
                                :skip="{ seconds: SKIP_SECONDS, direction: 'back' }"
                                class="h-8 w-8"
                            />
                        </V10Button>
                        <V10Button
                            round
                            class="h-20 w-20 disabled:opacity-60 [@media(max-height:840px)]:h-16 [@media(max-height:840px)]:w-16"
                            :class="{ invisible: starting }"
                            :label="playing ? t('media_player.pause') : t('media_player.play')"
                            data-test="mediaPlayerPlayPause"
                            :disabled="starting"
                            @click="togglePlay"
                        >
                            <V10Icon
                                v-if="playing"
                                name="pause"
                                class="h-[38px] w-[38px]"
                            />
                            <V10Icon
                                v-else
                                name="play"
                                class="h-[38px] w-[38px] translate-x-[8%]"
                            />
                        </V10Button>
                        <V10Button
                            round
                            class="h-14 w-14 [@media(max-height:840px)]:h-12 [@media(max-height:840px)]:w-12"
                            :class="{ invisible: !timeKnown || live }"
                            :label="t('media_player.skip_forward', { seconds: SKIP_SECONDS })"
                            data-test="mediaPlayerSkipForward"
                            @click="skip(SKIP_SECONDS)"
                        >
                            <V10Icon
                                :skip="{ seconds: SKIP_SECONDS, direction: 'forward' }"
                                class="h-8 w-8"
                            />
                        </V10Button>
                    </div>
                </template>
                <div
                    class="max-h-10 min-h-0 flex-shrink flex-grow basis-6"
                    aria-hidden="true"
                />
                <div
                    v-if="tabs.length"
                    role="tablist"
                    class="sticky bottom-0 mt-auto box-content flex h-12 w-full flex-none border-t border-zinc-300/60 bg-amber-50 dark:border-slate-600/60 dark:bg-slate-800 max-lg:pb-[max(env(safe-area-inset-bottom),var(--native-inset-bottom,0px))] [@media(max-height:840px)]:h-10"
                    :class="{ '!bg-transparent': wash, invisible: sheetTab }"
                    :aria-hidden="sheetTab ? 'true' : undefined"
                >
                    <button
                        v-for="tab in tabs"
                        :key="tab.id"
                        type="button"
                        role="tab"
                        class="flex flex-1 items-center justify-center gap-1.5 text-sm font-semibold"
                        :class="
                            sheetTab === tab.id
                                ? 'text-yellow-700 dark:text-yellow-400'
                                : 'text-zinc-600 dark:text-slate-300'
                        "
                        :aria-selected="sheetTab === tab.id"
                        :data-test="`mediaPlayerTab-${tab.id}`"
                        @click="toggleTab(tab.id)"
                    >
                        <ChevronUpIcon
                            class="h-4 w-4 transition-transform"
                            :class="{ 'rotate-180': sheetTab === tab.id }"
                        />
                        {{ tab.label }}
                    </button>
                </div>
            </div>

            <div
                v-if="!nowPlaying && sheetTab"
                class="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.12)] dark:bg-slate-900 max-lg:pb-[max(env(safe-area-inset-bottom),var(--native-inset-bottom,0px))]"
                :style="{
                    top: `${sheetTop}px`,
                    transform: sheetDragY ? `translateY(${sheetDragY}px)` : undefined,
                    transition: sheetDragging ? 'none' : `transform ${SHEET_SLIDE_MS}ms ease-out`,
                }"
                ref="sheetEl"
                role="region"
                :aria-label="sheetLabel"
                data-test="mediaPlayerSheet"
                @touchstart.passive="onSheetTouchStart"
                @touchmove="onSheetTouchMove"
                @touchend="onSheetTouchEnd"
                @touchcancel="onSheetTouchEnd"
            >
                <!-- The grabber closes the sheet; the tabs under it say where the viewer is and switch. -->
                <button
                    type="button"
                    class="flex h-7 w-full flex-none items-center justify-center"
                    :aria-label="t('media_player.minimise')"
                    data-test="mediaPlayerSheetClose"
                    @click="closeSheet"
                >
                    <span class="h-1 w-10 rounded-full bg-zinc-300 dark:bg-slate-600" />
                </button>
                <div
                    role="tablist"
                    class="flex flex-none border-b border-zinc-200 dark:border-slate-700"
                >
                    <button
                        v-for="tab in tabs"
                        :key="tab.id"
                        type="button"
                        role="tab"
                        class="min-h-[44px] flex-1 border-b-2 text-sm font-semibold"
                        :class="
                            sheetTab === tab.id
                                ? 'border-yellow-500 text-zinc-900 dark:text-white'
                                : 'border-transparent text-zinc-500 dark:text-slate-400'
                        "
                        :aria-selected="sheetTab === tab.id"
                        :data-test="`mediaPlayerSheetTab-${tab.id}`"
                        @click="selectTab(tab.id)"
                    >
                        {{ tab.label }}
                    </button>
                    <button
                        type="button"
                        class="flex h-[44px] w-11 flex-none items-center justify-center text-zinc-500 hover:text-zinc-900 dark:text-slate-400 dark:hover:text-white"
                        :aria-label="t('media_player.minimise')"
                        data-test="mediaPlayerSheetCloseButton"
                        @click="closeSheet"
                    >
                        <XMarkIcon class="h-5 w-5" />
                    </button>
                </div>

                <MediaPlayerUpNext
                    v-if="sheetTab === 'upnext'"
                    :next="upNext.next"
                    :related="upNext.related"
                    :tags="upNext.tags"
                    :selected-tag="upNextTag"
                    @select="playNext"
                    @select-tag="upNextTag = $event"
                />
                <MediaPlayerChapters
                    v-else-if="sheetTab === 'chapters'"
                    :chapters="chapters"
                    :current-time="currentTime"
                    :cue-at="chapterCueAt"
                    @select="playChapter"
                />
            </div>
        </section>

        <div
            v-if="audioFullscreen && !nowPlaying && content && state"
            ref="screenEl"
            data-lmpl-host-screen
            class="lmpl-root z-[70]"
            style="position: fixed; inset: 0; width: 100%; height: 100%; aspect-ratio: auto"
            data-test="mediaPlayerAudioFullscreen"
            @keydown.esc="audioFullscreen = false"
        >
            <AudioFullscreen
                :title="content.title"
                :subtitle="content.author"
                :artwork="screenArtwork"
                :appearance="isDarkTheme ? 'dark' : 'light'"
                :chapters="chapters"
                :current-time="currentTime"
                :duration="duration"
                :buffered-end="state.bufferedEnd"
                :playing="playing"
                :live="live"
                :chapter-index="screenChapterIndex"
                :playback-rate="state.playbackRate"
                :audio-tracks="screenTracks"
                :active-audio-track-id="state.activeAudioTrackId"
                :sleep-timer="sleepTimer"
                :has-browse="chapters.length > 0 || nextUp.length > 0"
                :up-next="nextUp"
                chapters-sheet
                :skip-back-seconds="SKIP_SECONDS"
                :skip-forward-seconds="SKIP_SECONDS"
                :chapter-mask="screenChapterMask"
                :messages="screenMessages"
                @exit="audioFullscreen = false"
                @toggle-play="togglePlay"
                @seek="(time) => controller?.seek(time)"
                @seek-chapter="(chapter) => controller?.seek(chapter.startTime)"
                @upnextselect="
                    (id) => {
                        const next = nextContents.find((doc) => doc._id === id);
                        if (next) playNext(next);
                    }
                "
                @rate="(rate) => controller?.setPlaybackRate(rate)"
                @audio-track="(id) => controller?.setAudioTrack(id)"
                @sleep="(option) => controller?.setSleepTimer(option)"
            >
                <template #cast>
                    <button
                        v-if="handle?.airPlayAvailable || handle?.castAvailable"
                        type="button"
                        class="lmpl-afs-iconbtn"
                        :aria-label="t(isMac ? 'media_player.airplay' : 'media_player.cast')"
                        data-test="mediaPlayerAudioFullscreenCast"
                        @click="handle?.airPlayAvailable ? handle.showAirPlayPicker?.() : handle?.showCastPicker?.()"
                    >
                        <V10Icon
                            :name="isMac ? 'airplay' : 'cast'"
                            class="h-[22px] w-[22px]"
                        />
                    </button>
                </template>
            </AudioFullscreen>
        </div>

        <!-- Rides on the menu: it moves down with it when the menu steps aside on scroll,
             stopping above the home indicator. -->
        <!-- Under the bar hangs a strip of its colour as tall as the home indicator's space: covered by the
             menu while that shows, it reaches the screen's edge once the menu slides away. -->
        <div
            v-if="!expanded && !miniVideo"
            ref="bar"
            class="fixed inset-x-0 bottom-[var(--mobile-menu-h,0px)] z-40 flex w-full items-center justify-between gap-2 border-t-2 border-t-amber-200 bg-amber-50 px-2 pb-2 pt-2.5 after:absolute after:inset-x-0 after:top-full after:h-[max(env(safe-area-inset-bottom),var(--native-inset-bottom,0px))] after:bg-amber-50 after:content-[''] dark:after:bg-slate-700 lg:after:hidden transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform dark:border-t-slate-600 dark:bg-slate-700 lg:bottom-5 lg:left-auto lg:right-5 lg:w-96 lg:translate-y-0 lg:overflow-hidden lg:rounded-lg lg:border-t-0 lg:shadow-lg"
            :class="
                mobileChrome.hidden.value
                    ? 'translate-y-[calc(var(--mobile-menu-h,0px)-max(env(safe-area-inset-bottom),var(--native-inset-bottom,0px)))]'
                    : 'translate-y-0'
            "
            data-test="mediaPlayerBar"
        >
            <div
                v-if="!live"
                class="absolute inset-x-0 top-0 h-0.5 bg-yellow-500"
                :style="{ width: `${progress * 100}%` }"
                aria-hidden="true"
                data-test="mediaPlayerBarProgress"
            />
            <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 text-left"
                :aria-label="t('media_player.expand')"
                @click="expandMediaPlayer"
            >
                <LImage
                    :image="content.parentImageData"
                    :content-parent-id="content.parentId"
                    :parent-image-bucket-id="content.parentImageBucketId"
                    aspectRatio="square"
                    size="smallSquare"
                    rounded
                />
                <span class="flex min-w-0 flex-col">
                    <span class="block truncate text-sm font-semibold">{{ content.title }}</span>
                    <span
                        v-if="content.author"
                        class="block truncate text-xs text-zinc-600 dark:text-slate-400"
                        >{{ content.author }}</span
                    >
                </span>
            </button>
            <button
                v-if="content.slug"
                type="button"
                class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                :aria-label="t('media_player.read')"
                data-test="mediaPlayerBarRead"
                @click="openPage"
            >
                <BookOpenIcon class="h-6 w-6 text-zinc-500 dark:text-slate-400" />
            </button>
            <button
                v-if="state"
                type="button"
                class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                :aria-label="playing ? t('media_player.pause') : t('media_player.play')"
                data-test="mediaPlayerBarPlayPause"
                @click="togglePlay"
            >
                <PauseIcon
                    v-if="playing"
                    class="h-7 w-7 text-zinc-500 dark:text-slate-400"
                />
                <PlayIcon
                    v-else
                    class="h-7 w-7 text-zinc-500 dark:text-slate-400"
                />
            </button>
            <button
                type="button"
                class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                :aria-label="t('media_player.close')"
                data-test="mediaPlayerBarClose"
                @click="closeMediaPlayer"
            >
                <XMarkIcon class="h-6 w-6 text-zinc-500 dark:text-slate-400" />
            </button>
        </div>
    </template>
</template>
