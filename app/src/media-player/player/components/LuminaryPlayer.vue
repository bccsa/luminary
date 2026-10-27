<script setup lang="ts">
/**
 * The Luminary web player on Video.js 10: `player-core` playback inside controls laid out for it.
 *
 * A `PlayerController` over an `HlsJsVideoAdapter` munges the master (LMCENC decrypt, angle
 * extraction, quality capping) and hands hls.js a blob playlist plus an in-memory key. The chrome is
 * composed here from v10's `media-*` elements rather than taken from its packaged skin, because the
 * packaged skin's control set is fixed: it has no skip buttons, no way to leave a menu out and no
 * bare windowed frame. The default skin's stylesheet still draws the buttons, icons and menus.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
// The elements and icons the controls use, and no others; see the module for why not the packaged skin.
import "../ui/register";
import {
    AUDIO_ONLY_ANGLE_ID,
    PlayerController,
    chapterIndexAt,
    chapterSegments,
    findPreferredTrack,
} from "@luminary-media-converter/player-web";
import type {
    Chapter,
    PlayerControllerApi,
    PlayerControllerOptions,
    PlayerError,
    PlayerSource,
    SleepTimerOption,
    ThumbnailSpriteCue,
} from "@luminary-media-converter/player-web";
import { HlsJsVideoAdapter } from "@luminary-media-converter/player-web";
import type { HlsJsVideoElement } from "@luminary-media-converter/player-web";
import { BlobServeStrategy } from "@luminary-media-converter/player-web";
import { usePlayerState } from "@luminary-media-converter/player-web";
import { mergeMessages, type PlayerMessages } from "../messages";
import { mergeControls, type PlayerControlsOptions } from "../controls";
import { createKeepAlive, SILENT_AUDIO_DATA_URI, type KeepAlive } from "../ui/keepAlive";
import { buildControlsHtml } from "../ui/controlsHtml";
import { installAutoHide, type ControlsStore } from "../ui/autoHide";
import { stepVolume } from "../ui/volume";
import { liftCues, liftLine, type LiftableCue } from "../ui/cueLift";
import { cuesToLyrics, type LyricCue } from "../ui/lyrics";
import { chapterMask, formatChapterOf } from "../ui/chapterBar";
import {
    attachControlTooltips,
    clampTooltipLeft,
    showOnTop,
    type Tooltip,
} from "../ui/controlTooltip";
import {
    SCRUB_EDGE_PX,
    clampPreviewCentre,
    formatClock,
    isOnBar,
    pointerRatio,
    previewTimes,
    rosterFineStep,
    rosterStep,
    rosterTiles,
} from "../ui/scrubPreview";
import { TimelineScrub } from "../ui/timelineScrub";
import ScrubThumbnail from "./ScrubThumbnail.vue";
import ScrubRoster from "./ScrubRoster.vue";
import ScrubPicture from "./ScrubPicture.vue";
import NextUpThumb from "./NextUpThumb.vue";
import AudioFullscreen from "./AudioFullscreen.vue";
import BrowsePanel from "./BrowsePanel.vue";
import { imageAttempts, toPlayerImage, type PlayerImageInput } from "../image";
import { isYouTubeUrl } from "@luminary-media-converter/player-web";
import type { PlayerUpNextItem } from "../upNext";
import { nextInstanceId } from "../ui/instanceId";

interface Props {
    /** What to play. Assigning a new object reloads the player. */
    source: PlayerSource;
    /** UI strings merged over the English defaults. */
    messages?: Partial<PlayerMessages>;
    /** Language of the skin's own control names (play, mute, fullscreen, cast…), e.g. `fr`; the page's `lang` when omitted. */
    lang?: string;
    /** Which controls to offer, and how far the skip buttons move. Anything omitted keeps the default. */
    controls?: Partial<PlayerControlsOptions>;
    /**
     * How the picture fills the frame while the player is windowed: `contain` letterboxes a source that is not the
     * frame's shape, `cover` fills the frame and crops what overflows. Fullscreen always letterboxes, whatever
     * this says — it is what fullscreen is for, and a cropped picture there would lose the edges of a screen-shaped
     * view. Set on the element's own `<video>`, which lives in its shadow DOM and so cannot be reached by a host's CSS.
     */
    windowedFit?: "contain" | "cover";
    /**
     * Keeps the browser from drawing the subtitles on the picture while it is windowed, for a host that shows the words
     * itself (see `subtitleCues`). Fullscreen draws them as usual, since the host's own place for them is out of view.
     */
    captionsHidden?: boolean;
    /** Artwork under the picture, until the first frame and while audio-only. */
    poster?: PlayerImageInput;
    /** Not supported yet on the v10 player; YouTube sources raise a `media` error. */
    youtubeEmbedUrl?: string;
    /** Videos offered after this one, listed in the fullscreen panel; a tap raises `upnextselect`. */
    upNext?: PlayerUpNextItem[];
    /**
     * The videos that may follow this one, best first. In fullscreen, with {@link NEXT_UP_LEAD_SECONDS} or less
     * left, a strip of cards offers them; unless dismissed the first is raised as `nextupselect` when this video ends.
     */
    nextUp?: PlayerUpNextItem[];
    /**
     * What is playing, for the fullscreen audio screen: the title, who it is by, and the series it belongs to. The
     * picture is the `poster`. Without a title the screen is left to the player's own controls.
     */
    nowPlaying?: { title: string; subtitle?: string; eyebrow?: string; artwork?: PlayerImageInput };
    /** The host's theme, for the fullscreen audio screen: `light` takes the picture's colour over the whole screen, `dark` stays plain with a glow behind the picture. */
    appearance?: "light" | "dark";
    /** Audio language to select automatically; a viewer's own choice outranks it. */
    preferredLanguage?: string;
    /** Options handed to the default `PlayerController`. */
    controllerOptions?: Partial<PlayerControllerOptions>;
    /** @internal Test seam — substitutes controller construction. */
    createController?: (media: HlsJsVideoElement) => PlayerControllerApi;
}

const props = defineProps<Props>();

/** Playback events raised in every source mode, for hosts that persist a resume point. */
const emit = defineEmits<{
    timeupdate: [currentTime: number, duration: number];
    loadedmetadata: [];
    ended: [];
    /** The viewer picked a video from the up-next list; carries its `id`. */
    upnextselect: [id: string];
    /** A next video was chosen, by its card or (the first) by this one ending; carries its `id`. Raised before `ended`. */
    nextupselect: [id: string];
    /** The viewer closed the card, so nothing follows this video. */
    nextupdismiss: [];
}>();

/**
 * How long before the end the up-next card appears. Only the very end, so the strip does not cover the picture while
 * there is still something to watch, however short the video.
 */
const NEXT_UP_LEAD_SECONDS = 10;
/** How many cards the strip holds. */
const NEXT_UP_MAX = 5;

const mediaEl = shallowRef<HlsJsVideoElement | null>(null);
const keepAliveEl = ref<HTMLAudioElement | null>(null);
const playerEl = ref<HTMLElement | null>(null);
const containerEl = ref<HTMLElement | null>(null);
const controller = shallowRef<PlayerControllerApi | null>(null);
const isFullscreen = ref(false);
const frameWidth = ref(0);
let frameObserver: ResizeObserver | null = null;
let keepAlive: KeepAlive | null = null;
let removeAutoHide: (() => void) | null = null;

const state = usePlayerState(controller);
const msg = computed(() => mergeMessages(props.messages));
const mergedControls = computed(() => mergeControls(props.controls));
const isYouTube = computed(() => isYouTubeUrl(props.source.masterUrl));

/** Element ids in the controls (menu triggers point at their menus by id) must not collide between players. */
const instanceId = nextInstanceId("lmpl");
/** The preview frame at a time, for the chapters' pictures. */
const chapterThumbnailAt = (seconds: number) => controller.value?.thumbnailAt(seconds) ?? null;
const controlsHtml = computed(() =>
    buildControlsHtml(
        mergedControls.value,
        instanceId,
        {
            browse: msg.value.browse,
            quality: msg.value.qualityLabel,
            audio: msg.value.languageLabel,
            speed: msg.value.speedLabel,
            captions: msg.value.captionsLabel,
            volumeUp: msg.value.volumeUp,
            volumeDown: msg.value.volumeDown,
        },
        props.nowPlaying?.title
            ? { title: props.nowPlaying.title, subtitle: props.nowPlaying.subtitle }
            : undefined,
    ),
);

/**
 * Clicking the picture plays and pauses, and a touch brings the controls up. A bare windowed frame
 * answers neither: the host's own interface is the transport, and a frame that also answered clicks
 * would be a second one. Fullscreen has no other transport, so it answers both.
 */
const gesturesOn = computed(
    () => (mergedControls.value.windowedControls || isFullscreen.value) && !audioFullscreen.value,
);

const UNSUPPORTED_YOUTUBE: PlayerError = {
    code: "media",
    fatal: true,
    message: "YouTube sources are not supported by the Video.js 10 player yet",
};
const sourceError = shallowRef<PlayerError | null>(null);

function defaultCreateController(media: HlsJsVideoElement): PlayerControllerApi {
    const serveStrategy =
        props.controllerOptions?.serveStrategy ??
        new BlobServeStrategy({ fetchImpl: props.controllerOptions?.fetchImpl });
    const liveSource = serveStrategy instanceof BlobServeStrategy ? serveStrategy : undefined;
    return new PlayerController(new HlsJsVideoAdapter(media, { liveSource }), {
        ...props.controllerOptions,
        serveStrategy,
    });
}

// --- source loading -------------------------------------------------------

let loadGeneration = 0;

async function loadSource(source: PlayerSource): Promise<void> {
    const media = mediaEl.value;
    if (!media) return;
    const generation = ++loadGeneration;
    sourceError.value = null;

    if (isYouTubeUrl(source.masterUrl)) {
        controller.value?.destroy();
        controller.value = null;
        sourceError.value = UNSUPPORTED_YOUTUBE;
        return;
    }

    controller.value ??= (props.createController ?? defaultCreateController)(media);
    await controller.value.load(source);
    if (generation !== loadGeneration) return;
    applyPreferredLanguage();
}

// --- preferred audio language ----------------------------------------------

let autoAppliedTrackId: string | null = null;
let preferredSuspended = false;

/**
 * Selects the track matching `preferredLanguage`, unless the viewer has taken the decision away:
 * the moment the active track becomes something neither this function chose nor the preference
 * names, it stands down until the host asks again (a new `source` or `preferredLanguage`).
 */
function applyPreferredLanguage(): void {
    if (isYouTube.value || preferredSuspended) return;
    const instance = controller.value;
    const preferred = props.preferredLanguage;
    if (!instance || !preferred) return;

    const snapshot = state.value;
    const target = findPreferredTrack(snapshot.audioTracks, preferred);
    if (!target) return;
    autoAppliedTrackId = target;
    if (target === snapshot.activeAudioTrackId) return;
    instance.setAudioTrack(target);
}

watch([() => props.source, () => props.preferredLanguage], () => {
    preferredSuspended = false;
    autoAppliedTrackId = null;
});

watch(
    [() => state.value.activeAudioTrackId, () => state.value.audioTracks],
    ([id, tracks], [, previousTracks]) => {
        // An active track arriving with a new list is a default, not a choice.
        if (tracks !== previousTracks) return;
        if (preferredSuspended || !id) return;
        const preferred = props.preferredLanguage;
        if (!preferred || id === autoAppliedTrackId) return;
        if (id === findPreferredTrack(tracks, preferred)) return;
        preferredSuspended = true;
    },
);

watch([() => state.value.audioTracks, () => props.preferredLanguage], applyPreferredLanguage);

// --- engine-driven selections ----------------------------------------------

/**
 * Mirrors a selection made in the skin's audio menu back into the controller. The menu writes
 * `track.enabled` on the element's list behind the controller's back, so without this
 * `activeAudioTrackId` would sit on whatever was selected before. Ids are joined by position: the
 * adapter builds its list from this same list in this same order, and the length check keeps a
 * half-rebuilt list from being joined to the old one.
 */
function onEngineAudioTrackChange(): void {
    const instance = controller.value;
    const tracks = mediaEl.value?.audioTracks;
    if (isYouTube.value || !instance || !tracks) return;
    const known = state.value.audioTracks;
    if (known.length !== tracks.length) return;
    let i = 0;
    for (const track of tracks) {
        if (track.enabled) {
            const id = known[i]?.id;
            if (id && id !== state.value.activeAudioTrackId) instance.setAudioTrack(id);
            return;
        }
        i++;
    }
}

/** Mirrors a selection made in the skin's captions menu back into the controller. */
function onEngineTextTrackChange(): void {
    const instance = controller.value;
    const tracks = mediaEl.value?.textTracks;
    if (isYouTube.value || !instance || !tracks) return;
    // The sound alone hands the engine no subtitles: their absence is not the viewer turning them off (the lyrics keep theirs).
    if (!Array.from(tracks).some((track) => track.kind === "subtitles")) return;
    let showing: string | null = null;
    for (const track of tracks) {
        if (track.kind === "subtitles" && track.mode === "showing") {
            // A track of the master is named as the controller names it, so a host's menu marks the same one.
            const named = state.value.subtitleTracks.find(
                (t) =>
                    t.source === "master" &&
                    (t.label === track.label || (!!t.lang && t.lang === track.language)),
            );
            showing = named?.id ?? (track.id || null);
            break;
        }
    }
    if (showing !== state.value.activeSubtitleTrackId) instance.setSubtitleTrack(showing);
}

// --- lifecycle ------------------------------------------------------------

const mediaListeners: [string, EventListener][] = [];
let audioTrackList: EventTarget | undefined;
let textTrackList: EventTarget | undefined;

/**
 * Listens to the element's audio and text track lists, for a choice made in the player's own menus.
 * `<hlsjs-video>` builds new lists with each engine and has none before one exists, so this runs on every
 * load, not once at mount: bound once, a language picked in the card would reach the engine but never the
 * controller, and the player's state would go on saying English.
 */
function bindTrackLists(): void {
    audioTrackList?.removeEventListener("change", onEngineAudioTrackChange);
    textTrackList?.removeEventListener("change", onEngineTextTrackChange);
    textTrackList?.removeEventListener("change", placeCues);
    textTrackList?.removeEventListener("addtrack", placeCues);
    const media = mediaEl.value;
    audioTrackList = media?.audioTracks as unknown as EventTarget | undefined;
    textTrackList = media?.textTracks as unknown as EventTarget | undefined;
    audioTrackList?.addEventListener("change", onEngineAudioTrackChange);
    textTrackList?.addEventListener("change", onEngineTextTrackChange);
    textTrackList?.addEventListener("change", placeCues);
    textTrackList?.addEventListener("addtrack", placeCues);
}

/** The name of the control the pointer rests on, or that the keyboard has reached; see ui/controlTooltip.ts. */
const tooltip = shallowRef<Tooltip | null>(null);
const tooltipEl = ref<HTMLElement | null>(null);
let removeTooltips: (() => void) | null = null;
// Placed once it is drawn: its width decides how far from the edge it must stay.
watch(
    tooltip,
    (tip) => {
        const el = tooltipEl.value;
        const container = containerEl.value;
        if (!tip || !el || !container) return;
        // In the top layer, so it stays over the volume and settings cards, which are there too; that layer is
        // placed against the viewport, not the player.
        showOnTop(el);
        const frame = container.getBoundingClientRect();
        el.style.left = `${frame.left + clampTooltipLeft(tip.centre, el.offsetWidth, container.clientWidth)}px`;
        el.style.bottom = `${document.documentElement.clientHeight - frame.bottom + tip.bottom}px`;
    },
    { flush: "post" },
);

onMounted(() => {
    if (containerEl.value)
        removeTooltips = attachControlTooltips(containerEl.value, (tip) => (tooltip.value = tip));
    const media = mediaEl.value;
    if (!media) return;

    const on = (type: string, handler: EventListener): void => {
        media.addEventListener(type, handler);
        mediaListeners.push([type, handler]);
    };
    on("play", () => {
        keepAlive?.sync(true);
        // Played some other way (a key, the lock screen): the scrub has nothing left to hold still.
        if (timelineScrub.isOpen) timelineScrub.reset();
    });
    on("playing", () => {
        keepAlive?.sync(true);
        mediaWaiting.value = false;
    });
    on("waiting", () => (mediaWaiting.value = true));
    on("canplay", () => (mediaWaiting.value = false));
    on("pause", () => keepAlive?.sync(false));
    on("ended", () => {
        keepAlive?.sync(false);
        // First, so a host sees the advance coming before it reacts to the end (e.g. leaving fullscreen).
        if (props.nextUp?.length && isFullscreen.value && !nextUpClosed.value) selectNextUp();
        emit("ended");
    });
    on("timeupdate", () => emit("timeupdate", media.currentTime || 0, media.duration || 0));
    on("loadedmetadata", () => {
        readPictureInPicture();
        emit("loadedmetadata");
    });
    on("loadeddata", applyPreferredLanguage);

    keepAlive = createKeepAlive(keepAliveEl.value);

    on("loadstart", bindTrackLists);
    bindTrackLists();
    applyFit();
    on("loadstart", applyFit);

    const frame = playerEl.value;
    if (frame && typeof ResizeObserver !== "undefined") {
        frameObserver = new ResizeObserver(([entry]) => {
            if (entry) frameWidth.value = entry.contentRect.width;
        });
        frameObserver.observe(frame);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    if (containerEl.value) {
        removeAutoHide = installAutoHide(
            containerEl.value,
            store,
            undefined,
            () => pin.value !== null || browseOpen.value || nextUpHasFocus(),
        );
        controlsObserver = new MutationObserver(readControlsShown);
        controlsObserver.observe(containerEl.value, {
            attributes: true,
            attributeFilter: [CONTROLS_VISIBLE_ATTR],
        });
        readControlsShown();
        castObserver = new MutationObserver(readCastAvailable);
        castObserver.observe(containerEl.value, {
            attributes: true,
            subtree: true,
            attributeFilter: ["data-availability"],
        });
        readCastAvailable();
    }
    void loadSource(props.source);
});

watch(
    () => state.value.lifecycle,
    (lifecycle) => {
        // A fatal error is not a transport event: `pause` never fires, and the silence would
        // loop on holding an audio session open for playback that has stopped existing.
        if (lifecycle === "error") keepAlive?.sync(false);
    },
);

watch(
    () => props.source,
    (next) => void loadSource(next),
);

onBeforeUnmount(() => {
    removeTooltips?.();
    removeTooltips = null;
    for (const [type, handler] of mediaListeners) mediaEl.value?.removeEventListener(type, handler);
    mediaListeners.length = 0;
    audioTrackList?.removeEventListener("change", onEngineAudioTrackChange);
    textTrackList?.removeEventListener("change", onEngineTextTrackChange);
    textTrackList?.removeEventListener("change", placeCues);
    textTrackList?.removeEventListener("addtrack", placeCues);
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    removeAutoHide?.();
    removeAutoHide = null;
    controlsObserver?.disconnect();
    controlsObserver = null;
    castObserver?.disconnect();
    castObserver = null;
    frameObserver?.disconnect();
    frameObserver = null;
    keepAlive?.dispose();
    keepAlive = null;
    controller.value?.destroy();
    controller.value = null;
});

// --- error surface --------------------------------------------------------

const ERROR_MESSAGE_KEYS: Partial<Record<PlayerError["code"], keyof PlayerMessages>> = {
    "unsupported-browser": "errorUnsupportedBrowser",
    "key-required": "errorKeyRequired",
    network: "errorNetwork",
    media: "errorMedia",
};

const displayedError = computed(() => sourceError.value ?? state.value.error);

const errorText = computed(() => {
    const code = displayedError.value?.code;
    const key = code ? ERROR_MESSAGE_KEYS[code] : undefined;
    return key ? msg.value[key] : msg.value.errorGeneric;
});

function retry(): void {
    void loadSource(props.source);
}

// --- fullscreen and the media surface ---------------------------------------

interface PlayerStore extends ControlsStore {
    requestFullscreen(): Promise<void>;
    exitFullscreen(): Promise<void>;
    volume: number;
    muted: boolean;
    setVolume(volume: number): number;
    setMuted(muted: boolean): boolean;
}

const store = (): PlayerStore | undefined =>
    (playerEl.value as unknown as { store?: PlayerStore } | null)?.store;

/** The `<video>` the element renders into; see {@link HlsJsVideoAdapter}'s own lookup for why it is found this way. */
function innerVideo(): HTMLVideoElement | null {
    const el = mediaEl.value as unknown as {
        target?: HTMLVideoElement | null;
        shadowRoot?: ShadowRoot | null;
    } | null;
    return el?.target ?? el?.shadowRoot?.querySelector("video") ?? null;
}

function applyFit(): void {
    const video = innerVideo();
    if (video)
        video.style.objectFit = isFullscreen.value ? "contain" : (props.windowedFit ?? "contain");
}

watch([isFullscreen, () => props.windowedFit], applyFit);

/** The browser's own subtitle drawing sits in the `<video>`'s shadow DOM too, so the rule that hides it goes there. */
const CUES_HIDDEN_CLASS = "lmpl-cues-hidden";
function applyCaptionsHidden(): void {
    const video = innerVideo();
    if (!video) return;
    const root = video.getRootNode();
    const holder = root instanceof ShadowRoot ? root : document.head;
    if (!holder.querySelector("style[data-lmpl-cues]")) {
        const style = document.createElement("style");
        style.dataset.lmplCues = "";
        style.textContent = `video.${CUES_HIDDEN_CLASS}::cue { opacity: 0; }`;
        holder.appendChild(style);
    }
    video.classList.toggle(CUES_HIDDEN_CLASS, !!props.captionsHidden && !isFullscreen.value);
}
watch(
    [isFullscreen, () => props.captionsHidden, () => state.value.subtitleTracks.length],
    applyCaptionsHidden,
    { flush: "post" },
);

function onFullscreenChange(): void {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    // A host's own full-screen page (its sound screen, say), marked `data-lmpl-host-screen`, is not this player's
    // full screen: it must not show the player's full-screen controls.
    const fullscreenElement = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
    isFullscreen.value =
        fullscreenElement !== null &&
        !(
            fullscreenElement instanceof Element &&
            fullscreenElement.closest("[data-lmpl-host-screen]")
        );
    // Fullscreen is always landscape: portrait is the host app's own page. A guarded no-op where the
    // browser cannot lock (iOS Safari), and the lock is let go when fullscreen ends.
    const orientation = (
        screen as Screen & {
            orientation?: { lock?: (type: string) => Promise<void>; unlock?: () => void };
        }
    ).orientation;
    // Sound alone has no picture to turn: the fullscreen audio screen has a portrait layout of its own.
    if (isFullscreen.value && !isAudioOnly.value)
        void orientation?.lock?.("landscape")?.catch(() => {});
    else if (!isFullscreen.value) orientation?.unlock?.();
    // A control clicked in fullscreen keeps focus once the bare frame hides it again, and a focused
    // control swallows every key but Tab: the host's shortcuts would stay dead until something else
    // took focus.
    if (isFullscreen.value || mergedControls.value.windowedControls) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && containerEl.value?.contains(active)) active.blur();
}

/**
 * The volume card's plus and minus buttons, caught on the container rather than bound one by one:
 * the controls are markup, not Vue elements, and a card in the top layer is still inside it for events.
 * Raising the volume of a muted player unmutes it, which is what pressing plus means.
 */
function onControlsClick(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest("[data-browse-toggle]")) {
        toggleBrowse();
        return;
    }
    const target =
        event.target instanceof Element
            ? event.target.closest<HTMLElement>("[data-volume-step]")
            : null;
    const player = store();
    if (!target || !player) return;
    const media = mediaEl.value;
    if (!media) return;
    const direction = target.dataset.volumeStep === "-1" ? -1 : 1;
    // Read and written on the element, which is the truth: the store follows it a moment later, and a
    // press in that moment would step from a volume that is already out of date, or ask the store to unmute
    // a player it believes is not muted.
    if (direction === 1 && media.muted) media.muted = false;
    player.setVolume(stepVolume(media.volume, direction));
}

/**
 * A double-click toggles fullscreen anywhere on the picture, in both directions. What is refused is a
 * double-click on an actual control, where it is two presses of that control rather than a gesture on
 * the picture. Not v10's own double-tap, which seeks when it lands on the left or right third.
 */
function onFrameDoubleClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".lmpl-cluster, .lmpl-bottom, .media-popup, .lmpl-roster")) return;
    if (isFullscreen.value) exitFullscreen();
    else void enterFullscreen();
}

async function enterFullscreen(): Promise<void> {
    try {
        await store()?.requestFullscreen();
    } catch {
        /* denied by the browser (no user gesture, policy) — stay inline */
    }
}

/** The fullscreen audio screen's asks of the engine. */
function setRate(rate: number): void {
    controller.value?.setPlaybackRate(rate);
}
function setSleep(option: SleepTimerOption | null): void {
    controller.value?.setSleepTimer(option);
}
function setAudioTrack(id: string): void {
    controller.value?.setAudioTrack(id);
}

function exitFullscreen(): void {
    // Rejected when nothing is fullscreen, and nobody would catch it.
    if (isFullscreen.value) void store()?.exitFullscreen();
}

/** A time the element can be handed: real, and not before the start of the media. */
function seek(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0 || !mediaEl.value) return;
    mediaEl.value.currentTime = seconds;
}

/** Starts playback and reports whether the browser allowed it; a refusal is expected, not an error. */
async function play(): Promise<boolean> {
    try {
        await mediaEl.value?.play();
        return true;
    } catch {
        return false;
    }
}

function pause(): void {
    mediaEl.value?.pause();
}

// --- audio-only -------------------------------------------------------------

/** Whether the picture is off — the audio-only rendering is what is playing. Read from the controller, so it survives a reload. */
const isAudioOnly = computed(
    () =>
        controller.value !== null &&
        (state.value.isAudioOnly || state.value.activeAngleId === AUDIO_ONLY_ANGLE_ID),
);

/** Fullscreen with only sound playing, and something to say about it: the now-playing screen takes over. */
const audioFullscreen = computed(
    () => isFullscreen.value && isAudioOnly.value && !!props.nowPlaying?.title,
);

// --- scrub preview ----------------------------------------------------------

interface ScrubState {
    cue: ThumbnailSpriteCue | null;
    label: string;
    /** The time the pointer names, in seconds. */
    time: number;
    /** The press is held: the frame under it is where the video would jump to. */
    held: boolean;
    /** Centre of the preview, in px from the container's left edge. */
    left: number;
    /** Gap, in px, between the container's bottom edge and the preview's. */
    bottom: number;
    /** Title of the chapter the previewed moment is in; empty when there are no chapters. */
    chapter: string;
    /** While the press is held, the strip of frames around the playhead that replaces the single frame. */
    roster: {
        tiles: { key: string; left: number; cue: ThumbnailSpriteCue | null }[];
        /** Where the marker sits, in px from the roster's left. */
        markerX: number;
        tileWidth: number;
        /** Gap, in px, between the container's bottom edge and the roster's: none, it rises from the edge over the controls. */
        bottom: number;
        /** How far the roster reaches up: the strip above the timeline's resting place plus everything under it. */
        height: number;
        /** The room between the timeline's resting place and the bottom edge, which the roster covers. */
        gap: number;
        /** Gap, in px, between the container's bottom edge and the time label above the timeline. */
        labelBottom: number;
    } | null;
}

const scrub = shallowRef<ScrubState | null>(null);

/** The title of the chapter a moment is in, or nothing when the video has no chapters or the moment is before the first. */
function chapterTitleAt(time: number): string {
    const chapters = state.value.chapters;
    const index = chapterIndexAt(chapters, time);
    return index < 0 ? "" : (chapters[index]?.title ?? "");
}

/** The timeline cut at the chapter starts; one plain bar when there are fewer than two chapters. */
const chapterBarMask = computed(() =>
    chapterMask(chapterSegments(state.value.chapters, state.value.duration)),
);

/** "Chapter 4 of 7" above the timeline, for the chapter the playhead is in; nothing without chapters. */
const chapterNowText = computed(() => {
    const chapters = state.value.chapters;
    if (chapters.length < 2) return "";
    const index = chapterIndexAt(chapters, state.value.currentTime);
    if (index < 0) return "";
    const title = chapters[index]?.title ?? "";
    return `${formatChapterOf(msg.value.chapterOf, index + 1, chapters.length)}${title ? ` · ${title}` : ""}`;
});
watch(
    chapterNowText,
    (text) => {
        const el = containerEl.value?.querySelector<HTMLElement>(".lmpl-chapter-now");
        if (!el) return;
        el.textContent = text;
        el.hidden = !text;
    },
    { flush: "post" },
);

/**
 * Scales with the player, like the controls: a thumbnail sized for a phone is a stamp on a 2000px screen.
 * A sixth of the width, between the 168px the Video.js 8 player used and a size past which the sprite's own
 * 160px frames only blur.
 */
const scrubWidth = computed(() => Math.round(Math.min(340, Math.max(168, frameWidth.value / 6))));

/** Room the preview keeps above the bar. */
const SCRUB_GAP_PX = 14;

/** Room between the timeline and its time label. */
const LABEL_GAP_PX = 8;

/**
 * The slider is taller than the track it draws (30 against 16 while held, per unit of the controls' scale), and the
 * track is centred in it, so it sits this far above the slider's bottom edge. The timeline lifts by the roster's
 * height less this, so the track's bottom meets the roster's top: neither floats above it nor is covered by it.
 */
const TRACK_INSET_PX = 7;

/**
 * The roster's height: that of the frame the hover preview shows, so the picture does not change size
 * between hovering the timeline and holding it. Frames are 16:9.
 */
const rosterHeight = computed(() => Math.round((scrubWidth.value * 9) / 16));

/** Whether a roster is on show: the timeline has made way for it, so the layout follows this and not the pointer. */
const rosterShown = computed(() => scrub.value?.roster != null || pin.value !== null);

function hideScrub(): void {
    if (scrub.value) scrub.value = null;
}

/**
 * Whether a press that began on the bar is still held. Tracked here rather than read from Video.js's
 * `data-dragging`, and not inferred from pointer capture: engines differ in both, and a drag that wanders
 * off the bar must keep its preview for as long as the button is down, wherever the pointer goes.
 */
let scrubbing = false;

/**
 * Whether the video was playing when a scrub began, and so is to play on when it ends. A scrubbed video holds still:
 * a playhead that keeps moving under the finger makes the strip drift and the landing a guess.
 */
let resumeAfterScrub = false;

function pauseForScrub(): void {
    const media = mediaEl.value;
    if (!media || media.paused || resumeAfterScrub) return;
    resumeAfterScrub = true;
    media.pause();
}

function resumeFromScrub(): void {
    if (!resumeAfterScrub) return;
    resumeAfterScrub = false;
    void mediaEl.value?.play();
}

/** The press ended, or was taken from us: nothing is being scrubbed any more. */
function endScrub(event?: PointerEvent): void {
    if (event && endTouch(event)) return;
    scrubbing = false;
    heldGap = null;
    resumeFromScrub();
    // A press that opened the roster leaves it open: the viewer lifted a finger to look, not to be done.
    const roster = scrub.value?.roster;
    if (roster && event?.type === "pointerup") {
        pin.value = {
            bottom: roster.bottom,
            labelBottom: roster.labelBottom,
            gap: roster.gap,
            markerX: roster.markerX,
        };
        pinAnchor.value = scrub.value?.time ?? null;
        armAnchorTimeout();
    }
    hideScrub();
}

// --- the timeline under a finger ------------------------------------------------

/**
 * A finger on the timeline does not seek where it lands: a tap opens the strip of frames (or, without frames, a
 * thicker bar with a handle) and holds the video, and only a drag moves it. The press is taken from the slider, which
 * would seek on release, and decided here. A mouse keeps the slider's click-to-seek.
 */
const timelineScrub = new TimelineScrub((effect) => {
    const media = mediaEl.value;
    switch (effect.kind) {
        case "open":
            if (effect.mode === "strip") openPinAtPlayhead();
            else barScrub.value = true;
            break;
        case "close":
            putAwayPin();
            barScrub.value = false;
            barDragAt.value = null;
            break;
        case "pause":
            media?.pause();
            break;
        case "play":
            void media?.play();
            break;
        case "seek":
            pinAnchor.value = effect.time;
            armAnchorTimeout();
            seek(effect.time);
            break;
    }
});
onBeforeUnmount(() => timelineScrub.reset());

/** Opened without frames: the bar thickens and carries a handle. */
const barScrub = ref(false);
/** Where a finger dragging the thick bar is, as a fraction of it; null while it rests on the playhead. */
const barDragAt = ref<number | null>(null);

/** How far a finger travels along the bar before a tap becomes a drag. */
const TOUCH_DRAG_SLOP_PX = 8;

/** A finger that came down on the timeline, until it lifts. */
let touchPress: { id: number; x: number; y: number; dragging: boolean } | null = null;

function isTouch(event: PointerEvent): boolean {
    return event.pointerType === "touch" || event.pointerType === "pen";
}

function framesReady(): boolean {
    const duration = mediaEl.value?.duration ?? NaN;
    return (
        state.value.thumbnailsReady &&
        mergedControls.value.scrubRoster &&
        Number.isFinite(duration) &&
        duration > 0
    );
}

function isPlaying(): boolean {
    const media = mediaEl.value;
    return !!media && !media.paused;
}

/** Where the handle sits on the thick bar: under the finger while it drags, else on the playhead. */
const scrubAt = computed(() => {
    if (barDragAt.value !== null) return barDragAt.value;
    const { duration, currentTime } = state.value;
    return duration > 0 ? Math.min(Math.max(currentTime / duration, 0), 1) : 0;
});

/**
 * A finger's press, travel and lift on the timeline, decided here rather than by the slider. True when the event is
 * done with; false lets the scrub preview run on it, as for a drag over the frames.
 */
function followTouch(event: PointerEvent): boolean {
    const container = containerEl.value;
    const slider = container?.querySelector<HTMLElement>(".lmpl-time-slider");
    if (!container || !slider) return false;
    if (event.type === "pointerdown") {
        const onBar = isOnBar(event.clientX, event.clientY, slider.getBoundingClientRect());
        if (isTouch(event) && onBar) {
            const duration = mediaEl.value?.duration ?? NaN;
            if (!Number.isFinite(duration) || duration <= 0) return true;
            // The slider never sees it, so it cannot seek on release.
            event.stopPropagation();
            event.preventDefault();
            container.setPointerCapture?.(event.pointerId);
            touchPress = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                dragging: false,
            };
            timelineScrub.touchBegan();
            return true;
        }
        if (timelineScrub.isOpen && !onBar) {
            // Play, which shows beside the thick bar, closes it and plays; anywhere else closes it and plays on.
            if (event.target instanceof Element && event.target.closest(".lmpl-play")) {
                event.stopPropagation();
                event.preventDefault();
                timelineScrub.playPressed();
                return true;
            }
            timelineScrub.tappedElsewhere();
        }
        return false;
    }
    if (!touchPress || event.pointerId !== touchPress.id) return false;
    if (
        !touchPress.dragging &&
        Math.hypot(event.clientX - touchPress.x, event.clientY - touchPress.y) > TOUCH_DRAG_SLOP_PX
    ) {
        touchPress.dragging = true;
        timelineScrub.dragBegan(framesReady(), isPlaying());
        scrubbing = true;
    }
    if (!touchPress.dragging) return true;
    if (timelineScrub.mode === "bar") {
        barDragAt.value = pointerRatio(event.clientX, slider.getBoundingClientRect());
        return true;
    }
    return false;
}

/** The finger lifted, or was taken away: a drag lands, a tap only opens. True when it was a finger on the timeline. */
function endTouch(event: PointerEvent): boolean {
    const press = touchPress;
    if (!press || event.pointerId !== press.id) return false;
    touchPress = null;
    const slider = containerEl.value?.querySelector<HTMLElement>(".lmpl-time-slider");
    const duration = mediaEl.value?.duration ?? NaN;
    if (!press.dragging) {
        if (event.type === "pointerup") timelineScrub.tapped(framesReady(), isPlaying());
        return true;
    }
    scrubbing = false;
    heldGap = null;
    const ratio = slider ? pointerRatio(event.clientX, slider.getBoundingClientRect()) : null;
    // The strip stays where the finger lifted, centred on where the video is going.
    const roster = scrub.value?.roster;
    if (roster && pin.value) pin.value = { ...pin.value, markerX: roster.markerX };
    hideScrub();
    barDragAt.value = null;
    if (event.type === "pointerup" && ratio !== null && Number.isFinite(duration) && duration > 0) {
        timelineScrub.dragEnded(Math.min(ratio * duration, Math.max(0, duration - 0.001)));
    } else {
        timelineScrub.dragCancelled();
    }
    return true;
}

/** The strip opened by a tap: its marker over the playhead, where the bar's fill ends. */
function openPinAtPlayhead(): void {
    const container = containerEl.value;
    const slider = container?.querySelector<HTMLElement>(".lmpl-time-slider");
    const media = mediaEl.value;
    if (!container || !slider || !media || !(media.duration > 0)) return;
    const bar = slider.getBoundingClientRect();
    const frame = container.getBoundingClientRect();
    restBarTop = bar.top;
    restBarBottom = bar.bottom;
    const ratio = Math.min(Math.max(media.currentTime / media.duration, 0), 1);
    pin.value = {
        bottom: 0,
        gap: frame.bottom - bar.bottom,
        markerX: bar.left - frame.left + ratio * bar.width,
        labelBottom:
            frame.bottom -
            (bar.top - (rosterHeight.value - TRACK_INSET_PX * controlsScale(slider))) +
            LABEL_GAP_PX,
    };
    pinAnchor.value = null;
}

/**
 * Follows the pointer over, or dragging, the timeline: where the viewer is about to land, which is not
 * where the video is. Driven from the container's pointer events rather than the slider's own, because
 * they cover a mouse hovering and a finger dragging alike, and a dragged slider holds the pointer
 * captured, so its events keep arriving after the pointer has left it.
 *
 * Offered only once there are frames to show: without them the timeline's own time readout stays.
 */
function updateScrub(event: PointerEvent): void {
    // The pinned roster is dragged by its own handlers; what happens on it is not a press on the timeline.
    if (event.target instanceof Element && event.target.closest(".lmpl-roster")) return;
    if (followTouch(event)) return;
    const container = containerEl.value;
    const slider = container?.querySelector<HTMLElement>(".lmpl-time-slider");
    const media = mediaEl.value;
    const instance = controller.value;
    if (!container || !slider || !media || !instance || !state.value.thumbnailsReady)
        return hideScrub();

    // Live has no length to scrub across.
    const duration = media.duration;
    if (!Number.isFinite(duration) || duration <= 0) return hideScrub();

    const bar = slider.getBoundingClientRect();
    const onBar = isOnBar(event.clientX, event.clientY, bar);
    // A press anywhere but the roster and the timeline (the fast way, which the roster is there to refine) closes a pinned roster.
    if (event.type === "pointerdown" && pin.value && !onBar) closePin();
    if (event.type === "pointerdown" && onBar) {
        scrubbing = true;
        pauseForScrub();
    }
    if (!scrubbing && !slider.hasAttribute("data-dragging") && !onBar) return hideScrub();

    const ratio = pointerRatio(event.clientX, bar);
    if (ratio === null) return hideScrub();
    const { time, lookup } = previewTimes(ratio, duration);

    const frame = container.getBoundingClientRect();
    const held = scrubbing || slider.hasAttribute("data-dragging");
    // With a roster pinned, hovering the bar has nothing to add: it is already showing the frames.
    if (pin.value && !held) return hideScrub();
    // The timeline slides up out of the way while held, so its resting position is read only when it is at rest.
    if (!rosterShown.value) {
        restBarTop = bar.top;
        restBarBottom = bar.bottom;
    }
    // The gap is fixed for the hold: controls fading in or out of full screen would otherwise resize every tile mid-drag.
    if (!held) heldGap = null;
    else heldGap ??= frame.bottom - restBarBottom;
    const roster =
        held && mergedControls.value.scrubRoster
            ? buildRoster(
                  instance,
                  time,
                  event.clientX - frame.left,
                  frame.width,
                  duration,
                  rosterStep(duration),
                  heldGap!,
              )
            : null;
    scrub.value = {
        // A lookup that lands in a gap in the cues keeps the frame already on show: a preview that blanks
        // for a moment between two frames reads as a fault, and a stale frame a hair away is not.
        cue: instance.thumbnailAt(lookup) ?? scrub.value?.cue ?? null,
        label: formatClock(time, duration >= 3600),
        chapter: chapterTitleAt(time),
        time,
        held,
        left: clampPreviewCentre(
            event.clientX - frame.left,
            scrubWidth.value,
            SCRUB_EDGE_PX,
            frame.width - SCRUB_EDGE_PX,
        ),
        bottom: frame.bottom - bar.top + SCRUB_GAP_PX,
        roster: roster && {
            tiles: roster.tiles,
            markerX: roster.markerX,
            tileWidth: roster.tileWidth,
            bottom: 0,
            height: roster.height,
            gap: heldGap ?? frame.bottom - restBarBottom,
            labelBottom:
                frame.bottom -
                (restBarTop - (rosterHeight.value - TRACK_INSET_PX * controlsScale(slider))) +
                LABEL_GAP_PX,
        },
    };
}

/** The frame laid over the picture: the one a held press names, or the one a pinned roster is dragged to. */
const pictureCue = computed(() => {
    if (!mergedControls.value.scrubPicture) return null;
    if (scrub.value?.held) return scrub.value.cue;
    return pinDrag.value?.moved ? (pinnedView.value?.cue ?? null) : null;
});

/** The controls' current scale, which grows with the player's width. */
function controlsScale(el: Element): number {
    return parseFloat(getComputedStyle(el).getPropertyValue("--lmpl-s")) || 1;
}

/** Where the timeline's top and bottom edges sat before it made way for the roster. */
let restBarTop = 0;
let restBarBottom = 0;
/** The gap under the timeline, read once when a press begins and kept until it ends. */
let heldGap: number | null = null;

/**
 * The strip of frames for a held press: the tile size comes from the sprite's own frame shape, the marker
 * stays under the pointer, and each slot looks its frame up by the time it stands for.
 */
function buildRoster(
    instance: PlayerControllerApi,
    time: number,
    pointerX: number,
    width: number,
    duration: number,
    step: number,
    gap: number,
): {
    tiles: { key: string; left: number; cue: ThumbnailSpriteCue | null }[];
    markerX: number;
    tileWidth: number;
    height: number;
    step: number;
} | null {
    const sample = instance.thumbnailAt(0);
    if (!sample || !sample.w || !sample.h) return null;
    // The roster rises from the bottom edge over the controls, and its frames fill all of that.
    const height = rosterHeight.value + gap;
    const tileWidth = Math.max(24, Math.round((height * sample.w) / sample.h));
    const markerX = Math.min(width, Math.max(0, pointerX));
    const tiles = rosterTiles(time, markerX, width, tileWidth, step, duration).map((tile) => ({
        // A different step makes the same index a different slot, so the step is part of the identity.
        key: `${step}:${tile.index}`,
        left: tile.left,
        cue: instance.thumbnailAt(tile.time),
    }));
    return { tiles, markerX, tileWidth, height, step };
}

// --- pinned roster ------------------------------------------------------------

/**
 * A roster left open after the press ends. Its marker stays where the press lifted and it follows playback, and it can
 * itself be dragged, the slow and precise way through the video (the timeline is the fast one): the strip moves with the finger,
 * the picture shows the frame it is passing, and the video goes there when the finger comes up. A tap on a
 * frame goes to that frame. It stays until closed — a press outside it, a new source, or a change of layout.
 */
const pin = shallowRef<{
    bottom: number;
    labelBottom: number;
    gap: number;
    markerX: number;
} | null>(null);

/** How far a finger may wander and still be tapping a frame rather than dragging the strip: a fingertip is not a pin. */
const PIN_TAP_SLOP_PX = 10;

interface PinDrag {
    startX: number;
    lastX: number;
    time: number;
    moved: boolean;
}
const pinDrag = shallowRef<PinDrag | null>(null);

/** The playhead, read every frame while a roster is pinned: `timeupdate` is a few times a second, which steps the strip. */
const pinNow = ref(0);
let pinFrame = 0;

function trackPlayhead(): void {
    const media = mediaEl.value;
    if (media && Number.isFinite(media.currentTime)) pinNow.value = media.currentTime;
    pinFrame = requestAnimationFrame(trackPlayhead);
}

watch(
    () => pin.value !== null,
    (open) => {
        cancelAnimationFrame(pinFrame);
        if (open) trackPlayhead();
    },
);
onBeforeUnmount(() => cancelAnimationFrame(pinFrame));

/** Where the roster stays, after a seek, until the video has caught up; else it would snap back to the old time. */
const pinAnchor = ref<number | null>(null);
let anchorTimer: ReturnType<typeof setTimeout> | undefined;

function armAnchorTimeout(): void {
    if (anchorTimer) clearTimeout(anchorTimer);
    anchorTimer = setTimeout(() => (pinAnchor.value = null), 1500);
}

watch(pinNow, (now) => {
    if (pinAnchor.value !== null && Math.abs(now - pinAnchor.value) < 0.75) pinAnchor.value = null;
});

function closePin(): void {
    resumeFromScrub();
    putAwayPin();
}

/** The strip goes, and playback is left as it is. */
function putAwayPin(): void {
    pin.value = null;
    pinDrag.value = null;
    pinAnchor.value = null;
    if (anchorTimer) clearTimeout(anchorTimer);
}

watch([isFullscreen, frameWidth, () => props.source], () => {
    timelineScrub.reset();
    closePin();
});
onBeforeUnmount(() => anchorTimer && clearTimeout(anchorTimer));

const pinnedView = computed(() => {
    const placed = pin.value;
    const instance = controller.value;
    const duration = state.value.duration;
    const width = frameWidth.value;
    if (!placed || scrub.value?.roster || !instance || !(duration > 0) || !(width > 0)) return null;
    const drag = pinDrag.value;
    const time = drag?.time ?? pinAnchor.value ?? pinNow.value;
    const step = rosterFineStep(duration);
    const built = buildRoster(instance, time, placed.markerX, width, duration, step, placed.gap);
    if (!built) return null;
    return {
        ...built,
        ...placed,
        time,
        label: formatClock(time, duration >= 3600),
        chapter: chapterTitleAt(time),
        cue: instance.thumbnailAt(Math.min(time, Math.max(0, duration - 0.001))),
    };
});

function onPinDown(event: PointerEvent): void {
    const view = pinnedView.value;
    if (!view) return;
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    if (isTouch(event)) timelineScrub.dragBegan(true, isPlaying());
    else pauseForScrub();
    pinDrag.value = {
        startX: event.clientX,
        lastX: event.clientX,
        time: view.time,
        moved: false,
    };
}

function onPinMove(event: PointerEvent): void {
    const drag = pinDrag.value;
    const duration = state.value.duration;
    if (!drag || !(duration > 0)) return;
    const view = pinnedView.value;
    if (!view) return;
    // The strip follows the finger one-to-one, at a scale that never changes during the drag.
    const time = drag.time - (event.clientX - drag.lastX) / (view.tileWidth / view.step);
    pinDrag.value = {
        ...drag,
        lastX: event.clientX,
        time: Math.min(Math.max(0, time), Math.max(0, duration - 0.001)),
        moved: drag.moved || Math.abs(event.clientX - drag.startX) > PIN_TAP_SLOP_PX,
    };
}

function onPinUp(event: PointerEvent): void {
    const drag = pinDrag.value;
    const view = pinnedView.value;
    pinDrag.value = null;
    const touch = isTouch(event);
    if (!drag || !view || event.type !== "pointerup")
        return touch ? timelineScrub.dragCancelled() : resumeFromScrub();
    let target = drag.time;
    if (!drag.moved) {
        // A tap: the frame under the finger, read off the strip's own scale.
        const frame = containerEl.value?.getBoundingClientRect();
        const duration = state.value.duration;
        target =
            view.time +
            (event.clientX - (frame?.left ?? 0) - view.markerX) / (view.tileWidth / view.step);
        target = Math.min(Math.max(0, target), Math.max(0, duration - 0.001));
    }
    if (touch) return timelineScrub.dragEnded(target);
    pinAnchor.value = target;
    armAnchorTimeout();
    seek(target);
    resumeFromScrub();
}

/**
 * Fetches the first sprite sheet the moment there is one, so the first hover is not a blank frame
 * waiting on an image. Later sheets load as the pointer reaches them.
 */
watch(
    () => state.value.thumbnailsReady,
    (ready) => {
        if (!ready) return;
        const first = controller.value?.thumbnailAt(0);
        if (first) new Image().src = first.spriteUrl;
    },
);

watch(
    () => props.source,
    () => hideScrub(),
);

// --- chapters and up next ---------------------------------------------------

const chapters = computed<Chapter[]>(() => state.value.chapters ?? []);

/** Something to browse: chapters, or videos that may follow. */
const hasBrowse = computed(() => chapters.value.length > 0 || (props.upNext?.length ?? 0) > 0);

const browseOpen = ref(false);
const browsePanel = ref<InstanceType<typeof BrowsePanel> | null>(null);

const currentChapter = computed(() => {
    const now = state.value.currentTime;
    return chapters.value.findIndex((chapter) => now >= chapter.startTime && now < chapter.endTime);
});

function toggleButton(): HTMLElement | null {
    return containerEl.value?.querySelector<HTMLElement>("[data-browse-toggle]") ?? null;
}

function openBrowse(): void {
    if (!hasBrowse.value || !isFullscreen.value) return;
    browseOpen.value = true;
}

/** Focus goes back to the button only when it was in the panel: a tap elsewhere has moved it on already. */
function closeBrowse(): void {
    if (!browseOpen.value) return;
    const hadFocus = browsePanel.value?.hasFocus() ?? false;
    browseOpen.value = false;
    if (hadFocus) void nextTick(() => toggleButton()?.focus());
}

function toggleBrowse(): void {
    if (browseOpen.value) closeBrowse();
    else void openBrowse();
}

function pickChapter(chapter: Chapter): void {
    seek(chapter.startTime);
    closeBrowse();
}

function pickUpNext(id: string): void {
    startSwitching();
    emit("upnextselect", id);
    closeBrowse();
}

// --- busy -------------------------------------------------------------------

/** Waiting for data, as the browser reports it. */
const mediaWaiting = ref(false);
/**
 * A video picked to play next is on its way from the tap until it plays: the host prepares it (its key, its source)
 * while the video before stands paused. Past `SWITCHING_LIMIT_MS` the controls show again whatever came.
 */
const SWITCHING_LIMIT_MS = 15_000;
const switching = ref(false);
let switchingFrom = "";
let switchingLimit: ReturnType<typeof setTimeout> | undefined;
function startSwitching(): void {
    switching.value = true;
    switchingFrom = props.source.masterUrl;
    clearTimeout(switchingLimit);
    switchingLimit = setTimeout(() => (switching.value = false), SWITCHING_LIMIT_MS);
}
watch(
    () => [props.source.masterUrl, state.value.playing, state.value.lifecycle] as const,
    ([url, playing, lifecycle]) => {
        if (switching.value && url !== switchingFrom && (playing || lifecycle === "error")) {
            switching.value = false;
            clearTimeout(switchingLimit);
        }
    },
);
onBeforeUnmount(() => clearTimeout(switchingLimit));
/**
 * Waiting for data the viewer asked to see, or a pick on its way: a spinner over the picture. Not a source merely
 * loading, which a poster nobody has pressed play on does too.
 */
const busy = computed(() => switching.value || (mediaWaiting.value && state.value.playing));
/**
 * Only where the player's own controls are: the now-playing screen, and a host driving a bare frame from its own
 * controls, show it in their own play button.
 */
const showsBusy = computed(
    () =>
        busy.value &&
        !audioFullscreen.value &&
        state.value.lifecycle !== "error" &&
        (mergedControls.value.windowedControls || isFullscreen.value),
);
/**
 * A finite video whose length is not known yet: skipping, speed and the timeline wait for it, so a source that turns
 * out to be live does not show them for a moment and take them away.
 */
const awaitingDuration = computed(() => !state.value.live && !(state.value.duration > 0));

/** Leaving fullscreen, nothing left to browse, or another video: the panel has no business staying. */
watch([isFullscreen, hasBrowse, () => props.source], ([full, any]) => {
    if (!full || !any) browseOpen.value = false;
    else closeBrowse();
});

/** The button's expanded state is markup the component does not render, so it is kept current by hand. */
watch(
    [browseOpen, controlsHtml],
    () => {
        toggleButton()?.setAttribute("aria-expanded", String(browseOpen.value));
    },
    { flush: "post" },
);

// --- up next card ------------------------------------------------------------

/** Set by the container while its controls are up; the card rides above them, and sits at the edge without. */
const CONTROLS_VISIBLE_ATTR = "data-controls-visible";
const controlsShown = ref(false);
let controlsObserver: MutationObserver | null = null;

// Casting, for a host that draws its own control (the app's sound screen): whether a Chromecast or an AirPlay
// device is around, read from the player's own buttons, and a way to open their picker.
const castAvailable = ref(false);
let castObserver: MutationObserver | null = null;
const castButtons = (): HTMLElement[] =>
    Array.from(
        containerEl.value?.querySelectorAll<HTMLElement>(
            "media-cast-button, media-airplay-button",
        ) ?? [],
    );
// Picture in picture, asked of the browser for the element's own <video>: the skin's button reads it of the custom
// element, which has no such method, and so says unavailable where the browser can.
const canPictureInPicture = ref(false);
type PresentableVideo = HTMLVideoElement & {
    webkitSupportsPresentationMode?: (mode: string) => boolean;
    webkitSetPresentationMode?: (mode: string) => void;
};
function readPictureInPicture(): void {
    const video = innerVideo() as PresentableVideo | null;
    canPictureInPicture.value =
        !!video &&
        !isAudioOnly.value &&
        ((document.pictureInPictureEnabled && !video.disablePictureInPicture) ||
            video.webkitSupportsPresentationMode?.("picture-in-picture") === true);
}
// A switch to sound alone, or back to the picture, changes the answer.
watch(isAudioOnly, readPictureInPicture);
function readCastAvailable(): void {
    castAvailable.value = castButtons().some(
        (button) => button.getAttribute("data-availability") === "available",
    );
}
function showCastPicker(): void {
    castButtons()
        .find((button) => button.getAttribute("data-availability") === "available")
        ?.click();
}
function startPictureInPicture(): void {
    const video = innerVideo() as PresentableVideo | null;
    if (!video) return;
    if (document.pictureInPictureEnabled && !video.disablePictureInPicture)
        void video.requestPictureInPicture().catch(() => {});
    else video.webkitSetPresentationMode?.("picture-in-picture");
}

function readControlsShown(): void {
    controlsShown.value = containerEl.value?.hasAttribute(CONTROLS_VISIBLE_ATTR) ?? false;
}

/** Dismissed or already chosen: either way the card has done its job for this video. */
const nextUpClosed = ref(false);
const nextUpEl = ref<HTMLElement | null>(null);

const nextUpVisible = computed(() => {
    if (!props.nextUp?.length || !isFullscreen.value || nextUpClosed.value || browseOpen.value)
        return false;
    const { duration, currentTime } = state.value;
    // Live and not-yet-known lengths have no end to count down to.
    if (!Number.isFinite(duration) || !(duration > 0)) return false;
    return duration - currentTime <= NEXT_UP_LEAD_SECONDS;
});

/** Room between the strip and what it must clear, per unit of the controls' scale. */
const NEXT_UP_GAP_PX = 8;

/**
 * Where the strip sits: `bottom` clears the controls (the chapter line, the timeline and the buttons) while they show,
 * and `max` limits its width only when the strip would otherwise cover the play and skip buttons in the middle of the
 * picture, which it then keeps to the right of. Measured, not assumed, because what is under it depends on the
 * player's size and on whether a chapter line is showing.
 */
const nextUpLayout = shallowRef<{ bottom: number | null; max: number | null }>({
    bottom: null,
    max: null,
});

function layoutNextUp(): void {
    const container = containerEl.value;
    const strip = nextUpEl.value;
    if (!container || !strip) return;
    const frame = container.getBoundingClientRect();
    const gap = NEXT_UP_GAP_PX * controlsScale(container);
    const bar = container.querySelector<HTMLElement>(".lmpl-bottom");
    // Without the controls the strip rests on the bottom edge, where the stylesheet puts it.
    const bottom =
        controlsShown.value && bar
            ? Math.max(0, frame.bottom - bar.getBoundingClientRect().top) + gap
            : null;
    const above = bottom ?? 2 * gap;
    const top = frame.bottom - above - strip.offsetHeight;
    // The cluster's box spans the picture; what must stay clear is its buttons.
    const buttons = controlsShown.value
        ? [...container.querySelectorAll<HTMLElement>(".lmpl-cluster-centre > *")]
              .map((el) => el.getBoundingClientRect())
              .filter((r) => r.width > 0)
        : [];
    const centre = buttons.length
        ? {
              bottom: Math.max(...buttons.map((r) => r.bottom)),
              right: Math.max(...buttons.map((r) => r.right)),
          }
        : undefined;
    // The strip is held to the right edge, so what is left of the buttons' right side is the room it may take.
    const max =
        centre && top < centre.bottom + gap
            ? Math.max(0, strip.getBoundingClientRect().right - (centre.right + gap))
            : null;
    const next = { bottom, max };
    const now = nextUpLayout.value;
    if (now.bottom !== next.bottom || now.max !== next.max) nextUpLayout.value = next;
}

let nextUpObserver: ResizeObserver | null = null;
watch(
    [nextUpVisible, controlsShown, frameWidth],
    async () => {
        await nextTick();
        layoutNextUp();
        nextUpObserver?.disconnect();
        if (!nextUpEl.value || typeof ResizeObserver === "undefined") return;
        nextUpObserver ??= new ResizeObserver(layoutNextUp);
        nextUpObserver.observe(nextUpEl.value);
        const bar = containerEl.value?.querySelector(".lmpl-bottom");
        if (bar) nextUpObserver.observe(bar);
        if (containerEl.value) nextUpObserver.observe(containerEl.value);
    },
    { flush: "post" },
);
onBeforeUnmount(() => nextUpObserver?.disconnect());

// --- subtitles clear of the controls ---------------------------------------

/** Where each lifted cue sat before, to put it back; see ui/cueLift.ts. */
const liftedCues = new WeakMap<LiftableCue, Pick<LiftableCue, "line" | "snapToLines">>();
const cueTracks = new WeakSet<TextTrack>();
let cueLine: number | null = null;

/** While the bar is up, the subtitles rest on it rather than under it. */
function placeCues(): void {
    const video = innerVideo();
    const bar = controlsShown.value
        ? containerEl.value?.querySelector<HTMLElement>(".lmpl-bottom")
        : null;
    const frame = video?.getBoundingClientRect();
    cueLine =
        bar && frame
            ? liftLine(frame.bottom - bar.getBoundingClientRect().top, frame.height)
            : null;
    for (const track of Array.from(video?.textTracks ?? [])) {
        if (!cueTracks.has(track)) {
            cueTracks.add(track);
            track.addEventListener("cuechange", onCueChange);
        }
        // A track that is not showing keeps nothing lifted, so it shows as authored when it is turned back on.
        const line = track.mode === "showing" ? cueLine : null;
        liftCues(Array.from(track.cues ?? []) as unknown as LiftableCue[], line, liftedCues);
    }
    readSubtitleCues();
}

/**
 * The words of the subtitles that are on, for a host that shows them itself (as lyrics): read again whenever the
 * track changes or a cue comes up, since a stream's subtitles arrive a segment at a time as the video plays.
 */
const subtitleCues = shallowRef<LyricCue[]>([]);
function readSubtitleCues(): void {
    const track = Array.from(innerVideo()?.textTracks ?? []).find(
        (t) => t.kind === "subtitles" && t.mode !== "disabled",
    );
    const next = cuesToLyrics(
        track?.cues as unknown as ArrayLike<{
            startTime: number;
            endTime: number;
            text: string;
        }> | null,
    );
    const now = subtitleCues.value;
    if (
        next.length !== now.length ||
        next.some((line, i) => line.start !== now[i]?.start || line.text !== now[i]?.text)
    ) {
        subtitleCues.value = next;
    }
}

/**
 * The whole track read from the stream, preferred over the engine's: the sound alone carries no subtitles to the
 * engine, and the engine holds only the segments it has buffered. Sidecar tracks are not read there, so they keep
 * the engine's.
 */
const streamCues = shallowRef<readonly LyricCue[]>([]);
watch(
    [controller, () => state.value.subtitleTracks, () => state.value.activeSubtitleTrackId],
    ([owner, , id]) => {
        streamCues.value = [];
        if (!owner || !id) return;
        void owner.readSubtitleCues(id).then((lines) => {
            if (controller.value === owner && state.value.activeSubtitleTrackId === id)
                streamCues.value = lines;
        });
    },
);

/** hls.js adds a stream's cues as the video plays, after a lift: each one is placed as it comes up. */
function onCueChange(event: Event): void {
    const track = event.target as TextTrack;
    readSubtitleCues();
    if (cueLine === null || track.mode !== "showing") return;
    liftCues(Array.from(track.activeCues ?? []) as unknown as LiftableCue[], cueLine, liftedCues);
}

watch([controlsShown, isFullscreen, frameWidth], placeCues, { flush: "post" });

/** The card holds the controls up while the viewer is working it by keyboard. */
function nextUpHasFocus(): boolean {
    return nextUpEl.value?.contains(document.activeElement) ?? false;
}

/** Chooses `id`, or the first on offer. */
function selectNextUp(id?: string): void {
    const next = id ?? props.nextUp?.[0]?.id;
    if (!next || nextUpClosed.value) return;
    nextUpClosed.value = true;
    startSwitching();
    emit("nextupselect", next);
}

/** Room for this many cards in the strip. */
const nextUpItems = computed(() => (props.nextUp ?? []).slice(0, NEXT_UP_MAX));

function dismissNextUp(): void {
    if (nextUpClosed.value) return;
    nextUpClosed.value = true;
    emit("nextupdismiss");
}

function onNextUpKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismissNextUp();
        return;
    }
    const cards = [...(nextUpEl.value?.querySelectorAll<HTMLElement>(".lmpl-nextup-card") ?? [])];
    const index = cards.findIndex((card) => card === document.activeElement);
    if (index < 0) return;
    const target =
        event.key === "ArrowRight"
            ? Math.min(cards.length - 1, index + 1)
            : event.key === "ArrowLeft"
              ? Math.max(0, index - 1)
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? cards.length - 1
                  : -1;
    if (target < 0) return;
    event.preventDefault();
    event.stopPropagation();
    cards[target]!.focus();
    cards[target]!.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

/** A vertical wheel scrolls the strip sideways, which a mouse has no other way to do. */
function onNextUpWheel(event: WheelEvent): void {
    const strip = event.currentTarget as HTMLElement;
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    strip.scrollLeft += event.deltaY;
    event.preventDefault();
}

// The strip opens at its first card, whatever it was scrolled to before.
watch(nextUpVisible, async (shown) => {
    if (!shown) return;
    await nextTick();
    nextUpEl.value?.querySelector<HTMLElement>(".lmpl-nextup-strip")?.scrollTo?.({ left: 0 });
});

// A new video is a new offer; fullscreen itself is kept across the change.
watch(
    () => props.source,
    () => {
        nextUpClosed.value = false;
    },
);

// --- artwork ----------------------------------------------------------------

const artworkImage = computed(() => toPlayerImage(props.poster));
const artworkAttempts = computed(() => imageAttempts(artworkImage.value));
const artworkAttemptIndex = ref(0);

watch(
    () => JSON.stringify(artworkAttempts.value),
    () => {
        artworkAttemptIndex.value = 0;
    },
);

const artworkAttempt = computed(() => artworkAttempts.value[artworkAttemptIndex.value] ?? null);

/** Onto the fallback, and past it to nothing: a broken-image glyph is worse. */
function onArtworkError(): void {
    artworkAttemptIndex.value += 1;
}

const artworkSizes = computed(() => {
    const given = artworkImage.value?.sizes;
    if (given) return given;
    if (isFullscreen.value || frameWidth.value <= 0) return "100vw";
    return `${Math.round(frameWidth.value)}px`;
});

const showArtworkLayer = computed(() => isAudioOnly.value || artworkAttempt.value !== null);

/** What the fullscreen audio screen draws as the cover: the picture that is showing now, fallbacks included. */
const nowPlayingAttempt = computed(
    () => imageAttempts(toPlayerImage(props.nowPlaying?.artwork))[0] ?? null,
);
const audioArtwork = computed(() => {
    const shown = artworkAttempt.value ?? nowPlayingAttempt.value;
    return shown ? { src: shown.src, srcset: shown.srcset } : null;
});
const audioChapterIndex = computed(() =>
    chapterIndexAt(state.value.chapters, state.value.currentTime),
);

// Volume and mute for a host that draws its own controls and keys: read off the element, which is the
// truth (see onControlsClick), and set through the store, as the player's own controls do.
const setMuted = (muted: boolean): void => void store()?.setMuted(muted);
const setVolume = (volume: number): void => void store()?.setVolume(volume);

defineExpose({
    controller,
    state,
    enterFullscreen,
    exitFullscreen,
    seek,
    play,
    pause,
    castAvailable,
    showCastPicker,
    canPictureInPicture,
    startPictureInPicture,
    get muted() {
        return mediaEl.value?.muted ?? false;
    },
    get volume() {
        return mediaEl.value?.volume ?? 1;
    },
    setMuted,
    setVolume,
    /** The subtitles' words that are on, timed; empty with none on. */
    get subtitleCues() {
        return streamCues.value.length ? streamCues.value : subtitleCues.value;
    },
});
</script>

<template>
    <div
        class="lmpl-root"
        :class="{
            'lmpl-windowed-bare': !mergedControls.windowedControls,
            'lmpl-is-fullscreen': isFullscreen,
            'lmpl-has-quality-choice': state.qualities.length > 1,
            'lmpl-has-audio-choice': state.audioTracks.length > 1,
            'lmpl-has-subtitles': state.subtitleTracks.length > 0,
            'lmpl-captions-on': !!state.activeSubtitleTrackId,
            'lmpl-has-thumbs': state.thumbnailsReady,
            'lmpl-has-browse': hasBrowse,
            'lmpl-has-heading': !!nowPlaying?.title,
            'lmpl-audio-fs': audioFullscreen,
            'lmpl-scrubbing': rosterShown,
            'lmpl-scrub-bar': barScrub,
            'lmpl-previewing': scrub !== null,
            'lmpl-is-busy': showsBusy,
            'lmpl-awaiting-duration': awaitingDuration,
        }"
        :style="{
            '--lmpl-roster-h': `${rosterHeight}px`,
            '--lmpl-track-inset': `${TRACK_INSET_PX}px`,
            '--lmpl-chapter-mask': chapterBarMask || undefined,
            '--lmpl-scrub-at': barScrub ? String(scrubAt) : undefined,
        }"
    >
        <video-player
            ref="playerEl"
            class="lmpl-video-player"
            :lang="lang"
        >
            <media-container
                ref="containerEl"
                class="media-skin media-container lmpl-container"
                data-theme="default"
                data-preset="video"
                @dblclick="onFrameDoubleClick"
                @click="onControlsClick"
                @pointermove="updateScrub"
                @pointerdown.capture="updateScrub"
                @pointerleave="hideScrub"
                @pointerup.capture="endScrub"
                @pointercancel.capture="endScrub"
            >
                <!-- Inside the container, so the artwork goes fullscreen with the picture. -->
                <div
                    v-if="showArtworkLayer"
                    class="lmpl-artwork"
                    :class="{ 'lmpl-artwork-audio': isAudioOnly }"
                    aria-hidden="true"
                >
                    <img
                        v-if="artworkAttempt"
                        :key="artworkAttemptIndex"
                        class="lmpl-artwork-img"
                        :srcset="artworkAttempt.srcset"
                        :sizes="artworkAttempt.srcset ? artworkSizes : undefined"
                        :src="artworkAttempt.src"
                        alt=""
                        draggable="false"
                        @error="onArtworkError"
                    />
                    <!-- heroicons 24/solid "musical-note", as on the audio/video toggle -->
                    <svg
                        v-if="isAudioOnly"
                        class="lmpl-audio-glyph"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                    >
                        <path
                            fill-rule="evenodd"
                            d="M19.952 1.651a.75.75 0 0 1 .298.599V16.303a3 3 0 0 1-2.176 2.884l-1.32.377a2.553 2.553 0 1 1-1.403-4.909l2.311-.66a1.5 1.5 0 0 0 1.088-1.442V6.994l-9 2.572v9.737a3 3 0 0 1-2.176 2.884l-1.32.377a2.553 2.553 0 1 1-1.402-4.909l2.31-.66a1.5 1.5 0 0 0 1.088-1.442V5.25a.75.75 0 0 1 .544-.721l10.5-3a.75.75 0 0 1 .658.122Z"
                            clip-rule="evenodd"
                        />
                    </svg>
                </div>
                <hlsjs-video
                    ref="mediaEl"
                    class="lmpl-media"
                    playsinline
                    preload="auto"
                ></hlsjs-video>

                <media-gesture
                    v-if="gesturesOn"
                    type="tap"
                    action="togglePaused"
                    pointer="mouse"
                    region="center"
                ></media-gesture>
                <media-gesture
                    v-if="gesturesOn"
                    type="tap"
                    action="toggleControls"
                    pointer="touch"
                ></media-gesture>

                <media-controls
                    class="lmpl-controls"
                    v-html="controlsHtml"
                ></media-controls>

                <!-- Inside the container, so it goes fullscreen with the picture, in the play button's place. -->
                <div
                    v-if="showsBusy"
                    class="lmpl-busy"
                    role="status"
                    :aria-label="msg.loading"
                    data-test="lmplBusy"
                >
                    <svg
                        class="lmpl-afs-spinner"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.4"
                        stroke-linecap="round"
                        aria-hidden="true"
                    >
                        <path d="M12 3a9 9 0 1 1-9 9" />
                    </svg>
                </div>

                <!-- Fullscreen with sound alone: a now-playing screen, over the controls it hides. -->
                <AudioFullscreen
                    v-if="audioFullscreen && nowPlaying"
                    :title="nowPlaying.title"
                    :subtitle="nowPlaying.subtitle"
                    :eyebrow="nowPlaying.eyebrow"
                    :artwork="audioArtwork"
                    :appearance="appearance ?? 'dark'"
                    :chapters="state.chapters"
                    :current-time="state.currentTime"
                    :duration="state.duration"
                    :buffered-end="state.bufferedEnd"
                    :playing="state.playing"
                    :chapter-index="audioChapterIndex"
                    :playback-rate="state.playbackRate"
                    :audio-tracks="state.audioTracks"
                    :active-audio-track-id="state.activeAudioTrackId"
                    :sleep-timer="state.sleepTimer"
                    :has-browse="hasBrowse"
                    :skip-back-seconds="mergedControls.skipBackSeconds"
                    :skip-forward-seconds="mergedControls.skipForwardSeconds"
                    :chapter-mask="chapterBarMask"
                    :messages="msg"
                    @exit="exitFullscreen"
                    @toggle-play="state.playing ? pause() : play()"
                    @seek="seek"
                    @open-browse="openBrowse"
                    @seek-chapter="(chapter: Chapter) => seek(chapter.startTime)"
                    @rate="setRate"
                    @audio-track="setAudioTrack"
                    @sleep="setSleep"
                >
                    <template #cast>
                        <media-cast-button
                            class="media-button lmpl-icon-btn media-cast-button lmpl-afs-iconbtn"
                        >
                            <media-icon
                                name="cast-enter"
                                class="media-button-icon media-cast-button-enter-icon"
                            ></media-icon>
                            <media-icon
                                name="cast-exit"
                                class="media-button-icon media-cast-button-exit-icon"
                            ></media-icon>
                        </media-cast-button>
                        <media-airplay-button
                            class="media-button lmpl-icon-btn media-airplay-button lmpl-afs-iconbtn"
                        >
                            <media-icon
                                name="airplay-enter"
                                class="media-button-icon media-airplay-button-enter-icon"
                            ></media-icon>
                            <media-icon
                                name="airplay-exit"
                                class="media-button-icon media-airplay-button-exit-icon"
                            ></media-icon>
                        </media-airplay-button>
                    </template>
                </AudioFullscreen>

                <!-- While held, the frame being scrubbed over the picture: a fast-forward, VHS style. -->
                <ScrubPicture
                    v-if="pictureCue"
                    :cue="pictureCue"
                    aria-hidden="true"
                />

                <div
                    v-if="scrub && !scrub.roster"
                    class="lmpl-scrub-preview"
                    :style="{ left: `${scrub.left}px`, bottom: `${scrub.bottom}px` }"
                >
                    <ScrubThumbnail
                        :cue="scrub.cue"
                        :label="scrub.label"
                        :chapter="scrub.chapter"
                        :width="scrubWidth"
                    />
                </div>
                <template v-if="pinnedView">
                    <ScrubRoster
                        :tiles="pinnedView.tiles"
                        :tile-width="pinnedView.tileWidth"
                        :height="pinnedView.height"
                        :marker-x="pinnedView.markerX"
                        :bottom="pinnedView.bottom"
                        interactive
                        @pointerdown.stop="onPinDown"
                        @pointermove.stop="onPinMove"
                        @pointerup.stop="onPinUp"
                        @pointercancel.stop="onPinUp"
                        @click.stop
                    />
                    <div
                        class="lmpl-scrub-preview lmpl-scrub-label"
                        :style="{
                            left: `${pinnedView.markerX}px`,
                            bottom: `${pinnedView.labelBottom}px`,
                        }"
                    >
                        <span class="lmpl-thumb-time"
                            >{{ pinnedView.label
                            }}<span
                                v-if="pinnedView.chapter"
                                class="lmpl-thumb-chapter"
                                >{{ pinnedView.chapter }}</span
                            ></span
                        >
                    </div>
                </template>
                <template v-if="scrub?.roster">
                    <ScrubRoster
                        :tiles="scrub.roster.tiles"
                        :tile-width="scrub.roster.tileWidth"
                        :height="scrub.roster.height"
                        :marker-x="scrub.roster.markerX"
                        :bottom="scrub.roster.bottom"
                    />
                    <div
                        class="lmpl-scrub-preview lmpl-scrub-label"
                        :style="{
                            left: `${scrub.left}px`,
                            bottom: `${scrub.roster.labelBottom}px`,
                        }"
                    >
                        <span class="lmpl-thumb-time"
                            >{{ scrub.label
                            }}<span
                                v-if="scrub.chapter"
                                class="lmpl-thumb-chapter"
                                >{{ scrub.chapter }}</span
                            ></span
                        >
                    </div>
                </template>
                <!-- The name of the control under the pointer; its left edge is set once it is drawn, to stay inside the frame. -->
                <div
                    v-if="tooltip"
                    ref="tooltipEl"
                    class="lmpl-tooltip"
                    role="tooltip"
                    popover="manual"
                >
                    {{ tooltip.text }}
                </div>

                <!-- Chapters and up next, over the picture so it goes fullscreen with it. -->
                <BrowsePanel
                    v-if="browseOpen && isFullscreen"
                    ref="browsePanel"
                    :chapters="chapters"
                    :current-chapter="currentChapter"
                    :up-next="upNext"
                    :messages="msg"
                    :id-prefix="instanceId"
                    :thumbnail-at="state.thumbnailsReady ? chapterThumbnailAt : undefined"
                    @close="closeBrowse"
                    @pick-chapter="pickChapter"
                    @pick-upnext="pickUpNext"
                />
                <!-- The videos that may follow, offered near the end; rides above the controls while they show. -->
                <div
                    v-if="nextUpItems.length && nextUpVisible"
                    ref="nextUpEl"
                    class="lmpl-nextup"
                    :class="{ 'lmpl-nextup-raised': controlsShown }"
                    :style="{
                        ...(nextUpLayout.bottom !== null
                            ? { '--lmpl-nextup-bottom': `${nextUpLayout.bottom}px` }
                            : {}),
                        ...(nextUpLayout.max !== null
                            ? { '--lmpl-nextup-max': `${nextUpLayout.max}px` }
                            : {}),
                    }"
                    role="region"
                    :aria-label="msg.nextUp"
                    @keydown="onNextUpKeydown"
                    @pointerdown.stop
                    @pointerup.stop
                    @dblclick.stop
                    @click.stop
                >
                    <div class="lmpl-nextup-head">
                        <span class="lmpl-nextup-label">{{ msg.nextUp }}</span>
                        <button
                            type="button"
                            class="media-button lmpl-icon-btn lmpl-nextup-close"
                            :aria-label="msg.dismiss"
                            @click="dismissNextUp"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                width="24"
                                height="24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2.2"
                                stroke-linecap="round"
                                aria-hidden="true"
                            >
                                <path d="M6 6l12 12M18 6L6 18" />
                            </svg>
                        </button>
                    </div>
                    <ul
                        class="lmpl-nextup-strip"
                        @wheel="onNextUpWheel"
                    >
                        <li
                            v-for="item in nextUpItems"
                            :key="item.id"
                            class="lmpl-nextup-item"
                        >
                            <button
                                type="button"
                                class="lmpl-nextup-card"
                                @click="selectNextUp(item.id)"
                            >
                                <span class="lmpl-nextup-thumb">
                                    <NextUpThumb :item="item" />
                                </span>
                                <span
                                    v-if="item.section"
                                    class="lmpl-nextup-section"
                                    >{{ item.section }}</span
                                >
                                <span class="lmpl-nextup-title">{{ item.title }}</span>
                            </button>
                        </li>
                    </ul>
                </div>
            </media-container>
        </video-player>

        <!-- Keeps the iOS audio session open across a re-source; see ui/keepAlive.ts. -->
        <audio
            ref="keepAliveEl"
            class="lmpl-keep-alive"
            loop
            muted
            preload="auto"
            :src="SILENT_AUDIO_DATA_URI"
        ></audio>

        <div class="lmpl-slot">
            <slot
                :state="state"
                :controller="controller"
            ></slot>
        </div>

        <template v-if="state.lifecycle === 'waiting-for-master'">
            <slot
                name="coming-soon"
                :state="state"
            >
                <div class="lmpl-panel lmpl-coming-soon">
                    <p class="lmpl-panel-text">{{ msg.comingSoon }}</p>
                </div>
            </slot>
        </template>

        <template v-else-if="state.lifecycle === 'error' || sourceError">
            <slot
                name="error"
                :state="state"
                :error="displayedError"
                :retry="retry"
            >
                <div class="lmpl-panel lmpl-error">
                    <p class="lmpl-panel-text">{{ errorText }}</p>
                    <button
                        type="button"
                        class="lmpl-btn lmpl-retry"
                        @click="retry"
                    >
                        {{ msg.retry }}
                    </button>
                </div>
            </slot>
        </template>
    </div>
</template>

<style>
/*
 * Stylesheet order is load-bearing: the default skin's rules come first and `styles.css` overrides
 * them. They are `@import`ed from a style block rather than `import`ed from a script, because
 * TypeScript preserves a side-effect `import` in the emitted `.d.ts`, where a consumer type-checking
 * with `skipLibCheck: false` then fails to resolve `.css`.
 */
@import "../generated/skin.css";
@import "../styles.css";
</style>
