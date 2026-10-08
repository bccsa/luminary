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
    ArrowsPointingOutIcon,
    BookOpenIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    FilmIcon,
    LanguageIcon,
    ListBulletIcon,
    MusicalNoteIcon,
    PauseIcon,
    PlayIcon,
    SpeakerWaveIcon,
    SpeakerXMarkIcon,
    XMarkIcon,
} from "@heroicons/vue/20/solid";
import { AUDIO_ONLY_ANGLE_ID, type Chapter } from "@luminary-media-converter/player-web";
import { db, type ContentDto, type Uuid } from "luminary-shared";
import { DateTime } from "luxon";
import VideoPlayer from "@/components/content/VideoPlayer.vue";
import LImage from "@/components/images/LImage.vue";
import { useMobileChromeAutoHide } from "@/composables/useMobileChromeAutoHide";
import { isMac } from "@/globalConfig";
import { isNativeApp } from "@/util/inAppBrowser";
import MediaPlayerAbout from "./MediaPlayerAbout.vue";
import MediaPlayerChapters from "./MediaPlayerChapters.vue";
import MediaPlayerMenu from "./MediaPlayerMenu.vue";
import MediaPlayerMenuItem from "./MediaPlayerMenuItem.vue";
import MediaPlayerUpNext from "./MediaPlayerUpNext.vue";
import { useUpNext } from "./useUpNext";
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
/** How far the full player is dragged down before it minimises. */
const MINIMISE_DRAG_PX = 80;

const engine = ref<InstanceType<typeof VideoPlayer> | null>(null);
const handle = computed(() => engine.value?.player ?? null);
const controller = computed(() => handle.value?.controller ?? null);
const state = computed(() => handle.value?.state ?? null);

const item = mediaPlayerItem;
const expanded = computed(() => mediaPlayerView.value === "expanded");
const content = computed(() => item.value?.content);

/**
 * What the content says, under the player: the article (or its summary), so the viewer reads while
 * the video or the sound goes on. Without either the sheet says so, and still leads to the page.
 */
type SheetTab = "upnext" | "chapters" | "about";
/** The tab the sheet under the picture shows; none while it is closed. */
const sheetTab = ref<SheetTab | null>(null);
/** The tag the Up next lists are narrowed to; it goes with the video, and the next one starts at All. */
const upNextTag = ref<Uuid | null>(null);
const upNext = useUpNext(content, upNextTag);
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
 * The tabs that have something to show; About is always there, and leads to the page. Chapters are
 * not among them: they belong to this one video, so they sit beside the picture's controls, not
 * with the lists that lead to other content.
 */
const tabs = computed<{ id: SheetTab; label: string }[]>(() => [
    // A chosen tag that has nothing left, or lists still loading, keep the tab: the viewer goes back to All.
    ...(upNext.value.next.length ||
    upNext.value.related.length ||
    upNextTag.value ||
    hadUpNext.value
        ? [{ id: "upnext" as const, label: t("media_player.up_next") }]
        : []),
    { id: "about" as const, label: t("media_player.about") },
]);
const sheetLabel = computed(() =>
    sheetTab.value === "chapters"
        ? t("media_player.chapters")
        : (tabs.value.find((tab) => tab.id === sheetTab.value)?.label ?? ""),
);
/** The chapter the playhead is in, for the strip that opens the list. */
const currentChapter = computed(() => {
    const at = currentTime.value;
    const index = chapters.value.findIndex((c) => at >= c.startTime && at < c.endTime);
    return index < 0 ? null : { title: chapters.value[index]!.title, index };
});
const pictureEl = ref<HTMLElement | null>(null);
const sectionEl = ref<HTMLElement | null>(null);
/** Where the sheet starts: just under the picture, which stays in view. */
const sheetTop = ref(0);
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

/** A chapter: the picture goes there, and plays on. */
function playChapter(chapter: Chapter) {
    handle.value?.seek(chapter.startTime);
    void handle.value?.play();
}

/** Another video, offered under this one: it takes the player. */
function playNext(next: ContentDto) {
    openMediaPlayer(next, item.value?.language);
}

/** The page of what plays, which also minimises the player: the route change does it. */
function openPage() {
    const slug = content.value?.slug;
    if (slug) void router.push({ name: "content", params: { slug } });
}

// The full player leaves the chrome in view: it starts below the open page's top bar (each page
// publishes that height on its own root, so it is measured here) and ends on the mobile menu.
const mobileChrome = useMobileChromeAutoHide();
const topBarHeight = ref(0);
function measureTopBar() {
    const topBar = document.querySelector<HTMLElement>("[data-top-bar]");
    // Hidden from xl up, where the page has no mobile top bar.
    const shown = !!topBar && getComputedStyle(topBar).display !== "none";
    topBarHeight.value = shown ? topBar.getBoundingClientRect().height : 0;
}
watch(
    expanded,
    async (isExpanded) => {
        if (!isExpanded || !item.value) return;
        mobileChrome.hidden.value = false;
        await nextTick();
        measureTopBar();
    },
    { immediate: true },
);
watch(
    () => item.value?.content._id,
    async () => {
        await nextTick();
        measureTopBar();
    },
);

// The player is laid out between the bars as measured when it opened: a page scrolling behind it
// (a phone waking up and restoring the scroll position, say) must not hide them, or the page shows
// through above and below the player.
watch(mobileChrome.hidden, (hidden) => {
    if (hidden && expanded.value) mobileChrome.hidden.value = false;
});

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
/** Back from the background (a locked phone, another app): the page may have moved while it slept. */
function onVisible() {
    if (document.visibilityState !== "visible" || !expanded.value) return;
    mobileChrome.hidden.value = false;
    measureTopBar();
}
onMounted(() => {
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("resize", measureTopBar);
    if (typeof ResizeObserver !== "undefined") barObserver = new ResizeObserver(publishBarHeight);
});
onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("resize", measureTopBar);
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

const audioMode = computed(
    () =>
        !!state.value &&
        (state.value.isAudioOnly || state.value.activeAngleId === AUDIO_ONLY_ANGLE_ID),
);
const playing = computed(() => state.value?.playing ?? false);
const currentTime = computed(() => state.value?.currentTime ?? 0);
const duration = computed(() => state.value?.duration ?? 0);
const live = computed(() => duration.value === Infinity);
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
    if (!state.value) return true;
    if (state.value.lifecycle === "loading") return true;
    return (
        state.value.lifecycle === "ready" &&
        !playing.value &&
        !state.value.ended &&
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
const progress = computed(() => fraction(currentTime.value));
const loaded = computed(() => fraction(state.value?.bufferedEnd ?? 0));

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
    if (!audioMode.value) await controller.value?.setAngle(AUDIO_ONLY_ANGLE_ID);
}

async function showVideo() {
    const target =
        videoAngleId ??
        videoAngles.value.find((angle) => angle.isDefault)?.id ??
        videoAngles.value[0]?.id;
    if (audioMode.value && target) await controller.value?.setAngle(target);
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

function seekTo(event: Event) {
    handle.value?.seek(Number((event.target as HTMLInputElement).value));
}

const openMenu = ref<"speed" | "language" | "subtitles" | null>(null);
function toggleMenu(menu: "speed" | "language" | "subtitles") {
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
/** The language playing, as a short code: the full name is in the menu, and a long one pushes the row's other buttons down a line. */
const activeLanguageCode = computed(() => {
    const track = state.value?.audioTracks.find((t) => t.id === state.value?.activeAudioTrackId);
    return (track?.lang ?? track?.label ?? "").slice(0, 3).toUpperCase();
});

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

// Dragging the handle down minimises, as the app's audio player did.
let dragStartY: number | null = null;
function onDragStart(event: PointerEvent) {
    dragStartY = event.clientY;
}
function onDragMove(event: PointerEvent) {
    if (dragStartY !== null && event.clientY - dragStartY > MINIMISE_DRAG_PX) {
        dragStartY = null;
        minimiseMediaPlayer();
    }
}
function onDragEnd() {
    dragStartY = null;
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") minimiseMediaPlayer();
}
</script>

<template>
    <template v-if="item && content">
        <section
            role="dialog"
            :aria-label="content.title"
            :aria-hidden="!expanded"
            class="fixed inset-x-0 bottom-[var(--mobile-menu-h,0px)] top-[var(--media-player-top,0px)] z-40 flex flex-col overflow-y-auto overscroll-contain transition-transform duration-300 ease-out lg:inset-auto lg:bottom-5 lg:right-5 lg:max-h-[90vh] lg:w-96 lg:rounded-2xl lg:shadow-2xl lg:shadow-black/20"
            :class="expanded ? 'translate-y-0' : 'pointer-events-none translate-y-[110vh]'"
            :style="{ '--media-player-top': `${topBarHeight}px` }"
            ref="sectionEl"
            data-test="mediaPlayer"
            @keydown="onKeydown"
        >
            <div class="bg-amber-50 dark:bg-slate-800">
                <div
                    class="flex touch-none justify-center pb-1 lg:hidden"
                    :class="topBarHeight ? 'pt-3' : 'pt-[max(env(safe-area-inset-top),0.75rem)]'"
                    @pointerdown="onDragStart"
                    @pointermove="onDragMove"
                    @pointerup="onDragEnd"
                    @pointercancel="onDragEnd"
                >
                    <div
                        class="mt-1 h-1.5 w-32 rounded-full bg-zinc-400 opacity-50 dark:bg-slate-400"
                    />
                </div>

                <div class="flex items-center justify-between px-4 pb-3">
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
                ref="pictureEl"
                class="relative aspect-video w-full"
                :class="inlineHole ? 'bg-transparent' : 'bg-black'"
            >
                <div
                    v-show="!audioMode"
                    class="absolute inset-0"
                >
                    <VideoPlayer
                        :key="content._id"
                        ref="engine"
                        :content="content"
                        :language="item.language"
                        :start-audio="startAudio"
                        autoplay
                        inline
                        :fullscreen-on-play="isNativeApp()"
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
                    v-if="stalled && !audioMode"
                    class="pointer-events-none absolute inset-0 flex items-center justify-center"
                    role="status"
                    :aria-label="t('video_player.loading')"
                    data-test="mediaPlayerStalled"
                >
                    <span
                        class="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white"
                        aria-hidden="true"
                    />
                </div>

                <div
                    v-if="audioMode"
                    class="absolute inset-0 flex items-center justify-center bg-amber-50 dark:bg-slate-800"
                >
                    <LImage
                        :image="content.parentImageData"
                        :content-parent-id="content.parentId"
                        :parent-image-bucket-id="content.parentImageBucketId"
                        aspectRatio="square"
                        size="thumbnail"
                        rounded
                        class="h-full max-h-full w-auto"
                    />
                </div>
            </div>

            <div class="flex flex-1 flex-col bg-amber-50 dark:bg-slate-800">
                <div class="space-y-1 px-6 pt-6 text-center">
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
                    <button
                        v-if="chapters.length"
                        type="button"
                        class="mx-auto mt-4 flex h-11 max-w-full items-center gap-2 rounded-full border border-zinc-500/35 px-4 text-sm font-semibold text-zinc-600 dark:text-slate-300"
                        :class="{ 'bg-zinc-500/15': sheetTab === 'chapters' }"
                        :aria-label="t('media_player.chapters')"
                        :aria-expanded="sheetTab === 'chapters'"
                        data-test="mediaPlayerChapterStrip"
                        @click="toggleTab('chapters')"
                    >
                        <ListBulletIcon class="h-5 w-5 flex-shrink-0" />
                        <span class="min-w-0 truncate">{{
                            currentChapter?.title ?? t("media_player.chapters")
                        }}</span>
                        <span
                            v-if="currentChapter"
                            class="flex-shrink-0 text-xs font-normal tabular-nums text-zinc-500 dark:text-slate-400"
                            >{{ currentChapter.index + 1 }}/{{ chapters.length }}</span
                        >
                    </button>
                    <div
                        class="relative flex flex-wrap items-center justify-center gap-y-2 px-3"
                        data-test="mediaPlayerControls"
                        :class="[
                            // Nothing to press yet: out of sight, but keeping its room, so the page does not move.
                            { invisible: starting },
                            chapters.length ? 'pt-4' : 'pt-8',
                            // A seventh button: tighter, so the row still fits a 390 pt phone.
                            handle?.airPlayAvailable ? 'gap-1' : 'gap-2',
                        ]"
                    >
                        <div
                            v-if="!live && timeKnown"
                            class="relative flex-shrink-0"
                        >
                            <button
                                type="button"
                                class="h-11 rounded-full border border-zinc-500/35 px-3 text-sm font-semibold text-zinc-600 dark:text-slate-300"
                                :aria-label="t('media_player.speed')"
                                :aria-expanded="openMenu === 'speed'"
                                @click="toggleMenu('speed')"
                            >
                                {{ rateLabel(state.playbackRate) }}
                            </button>
                            <MediaPlayerMenu v-if="openMenu === 'speed'">
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
                            v-if="state.audioTracks.length > 1"
                            class="relative flex-shrink-0"
                        >
                            <button
                                type="button"
                                class="flex h-11 items-center gap-1.5 rounded-full border border-zinc-500/35 px-3 text-sm font-semibold text-zinc-600 dark:text-slate-300"
                                :aria-label="t('media_player.language')"
                                :aria-expanded="openMenu === 'language'"
                                @click="toggleMenu('language')"
                            >
                                <LanguageIcon class="h-4 w-4" />
                                {{ activeLanguageCode }}
                            </button>
                            <MediaPlayerMenu v-if="openMenu === 'language'">
                                <MediaPlayerMenuItem
                                    v-for="track in state.audioTracks"
                                    :key="track.id"
                                    :label="track.label"
                                    :selected="track.id === state.activeAudioTrackId"
                                    @pick="pickTrack(track.id)"
                                />
                            </MediaPlayerMenu>
                        </div>
                        <template v-if="!audioMode">
                            <div class="relative flex-shrink-0">
                                <button
                                    type="button"
                                    class="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-500/35 text-zinc-600 disabled:opacity-40 dark:text-slate-300"
                                    :class="{ 'bg-zinc-500/15': state.activeSubtitleTrackId }"
                                    :aria-label="t('media_player.subtitles')"
                                    :aria-expanded="openMenu === 'subtitles'"
                                    :disabled="state.subtitleTracks.length === 0"
                                    data-test="mediaPlayerSubtitles"
                                    @click="toggleMenu('subtitles')"
                                >
                                    <span
                                        class="rounded-[4px] border-2 border-current px-[3px] text-[11px] font-extrabold leading-[14px]"
                                        aria-hidden="true"
                                        >CC</span
                                    >
                                </button>
                                <MediaPlayerMenu v-if="openMenu === 'subtitles'">
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
                                type="button"
                                class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-zinc-500/35 text-zinc-600 disabled:opacity-40 dark:text-slate-300"
                                :aria-label="t('media_player.picture_in_picture')"
                                :disabled="!handle?.canPictureInPicture"
                                data-test="mediaPlayerPictureInPicture"
                                @click="handle?.startPictureInPicture?.()"
                            >
                                <svg
                                    class="h-5 w-5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    aria-hidden="true"
                                >
                                    <rect
                                        x="2.5"
                                        y="4.5"
                                        width="19"
                                        height="15"
                                        rx="1.5"
                                    />
                                    <rect
                                        x="12"
                                        y="11.5"
                                        width="7"
                                        height="5"
                                        fill="currentColor"
                                        stroke="none"
                                    />
                                </svg>
                            </button>
                        </template>
                        <button
                            v-if="handle?.airPlayAvailable"
                            type="button"
                            class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-zinc-500/35 text-zinc-600 dark:text-slate-300"
                            :class="{
                                'bg-zinc-500/15 text-yellow-700 dark:text-yellow-400':
                                    handle?.airPlayActive,
                            }"
                            :aria-label="t(isMac ? 'media_player.airplay' : 'media_player.cast')"
                            :aria-pressed="handle?.airPlayActive === true"
                            data-test="mediaPlayerAirPlay"
                            @click="handle?.showAirPlayPicker?.()"
                        >
                            <svg
                                v-if="isMac"
                                class="h-5 w-5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linejoin="round"
                                aria-hidden="true"
                            >
                                <path
                                    d="M7 17H5.5A2.5 2.5 0 0 1 3 14.5v-8A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v8a2.5 2.5 0 0 1-2.5 2.5H17"
                                />
                                <path
                                    d="M12 14l5 6H7l5-6z"
                                    fill="currentColor"
                                />
                            </svg>
                            <svg
                                v-else
                                class="h-5 w-5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                            >
                                <path
                                    d="M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"
                                />
                                <path d="M3 12a9 9 0 0 1 9 9" />
                                <path d="M3 16a5 5 0 0 1 5 5" />
                                <path d="M3 20h.01" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-zinc-500/35 text-zinc-600 disabled:opacity-40 dark:text-slate-300"
                            :aria-label="muted ? t('media_player.unmute') : t('media_player.mute')"
                            :aria-pressed="muted"
                            :disabled="!handle?.canMute"
                            data-test="mediaPlayerMute"
                            @click="handle?.setMuted?.(!muted)"
                        >
                            <SpeakerXMarkIcon
                                v-if="muted"
                                class="h-5 w-5"
                            />
                            <SpeakerWaveIcon
                                v-else
                                class="h-5 w-5"
                            />
                        </button>
                        <button
                            v-if="!audioMode"
                            type="button"
                            class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-zinc-500/35 text-zinc-600 dark:text-slate-300"
                            :aria-label="t('media_player.fullscreen')"
                            data-test="mediaPlayerFullscreen"
                            @click="handle?.enterFullscreen()"
                        >
                            <ArrowsPointingOutIcon class="h-5 w-5" />
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
                    <div class="relative">
                        <div
                            class="flex flex-col px-10 pt-5"
                            :class="{ invisible: !timeKnown || live }"
                            data-test="mediaPlayerSeekBar"
                        >
                            <!-- The drawn bar shows what has played and what is loaded; the range on top of it
                             is what takes the touch, with only its thumb showing. -->
                            <div class="relative flex h-5 items-center">
                                <div
                                    class="absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-zinc-300 dark:bg-slate-600"
                                    aria-hidden="true"
                                >
                                    <div
                                        class="absolute inset-y-0 left-0 bg-zinc-400 dark:bg-slate-400"
                                        :style="{ width: `${loaded * 100}%` }"
                                        data-test="mediaPlayerLoaded"
                                    />
                                    <div
                                        class="absolute inset-y-0 left-0 bg-yellow-500"
                                        :style="{ width: `${progress * 100}%` }"
                                    />
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    :max="duration || 0"
                                    step="1"
                                    :value="currentTime"
                                    :aria-label="t('media_player.seek')"
                                    class="relative h-5 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-yellow-500 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-500"
                                    data-test="mediaPlayerSeek"
                                    @change="seekTo"
                                />
                            </div>
                            <div
                                class="mt-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-300"
                            >
                                <span>{{ formatTime(currentTime) }}</span>
                                <span>{{ formatTime(duration) }}</span>
                            </div>
                        </div>
                        <div
                            v-if="live"
                            class="absolute inset-x-0 top-5 flex h-10 items-center justify-center"
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

                    <div
                        class="flex items-center justify-center gap-6 pb-6 pt-0 text-zinc-500 dark:text-slate-400"
                    >
                        <button
                            type="button"
                            class="flex h-14 w-14 items-center justify-center"
                            :class="{ invisible: !timeKnown || live }"
                            :aria-label="t('media_player.skip_back', { seconds: SKIP_SECONDS })"
                            @click="skip(-SKIP_SECONDS)"
                        >
                            <span
                                class="vjs-icon-replay-10 text-[40px] leading-none"
                                aria-hidden="true"
                            />
                        </button>
                        <button
                            type="button"
                            class="flex h-[72px] w-[72px] items-center justify-center rounded-full"
                            :aria-label="playing ? t('media_player.pause') : t('media_player.play')"
                            data-test="mediaPlayerPlayPause"
                            :disabled="starting"
                            @click="togglePlay"
                        >
                            <PauseIcon
                                v-if="playing"
                                class="h-12 w-12"
                            />
                            <span
                                v-else-if="starting"
                                class="border-current/30 relative -top-28 h-10 w-10 animate-spin rounded-full border-4 border-t-current"
                                role="status"
                                :aria-label="t('video_player.loading')"
                                data-test="mediaPlayerStarting"
                            />
                            <PlayIcon
                                v-else
                                class="h-12 w-12"
                            />
                        </button>
                        <button
                            type="button"
                            class="flex h-14 w-14 items-center justify-center"
                            :class="{ invisible: !timeKnown || live }"
                            :aria-label="t('media_player.skip_forward', { seconds: SKIP_SECONDS })"
                            @click="skip(SKIP_SECONDS)"
                        >
                            <span
                                class="vjs-icon-forward-10 text-[40px] leading-none"
                                aria-hidden="true"
                            />
                        </button>
                    </div>
                </template>
                <div
                    role="tablist"
                    class="sticky bottom-0 mt-auto flex h-12 w-full flex-none border-t border-zinc-300/60 bg-amber-50 dark:border-slate-600/60 dark:bg-slate-800"
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
                v-if="sheetTab"
                class="absolute inset-x-0 bottom-12 z-20 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.12)] dark:bg-slate-900"
                :style="{ top: `${sheetTop}px` }"
                role="region"
                :aria-label="sheetLabel"
                data-test="mediaPlayerSheet"
            >
                <div class="flex items-center justify-between px-4 py-2">
                    <button
                        type="button"
                        class="flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-zinc-600 dark:text-slate-300"
                        data-test="mediaPlayerSheetClose"
                        @click="sheetTab = null"
                    >
                        <ChevronDownIcon class="h-5 w-5" />
                        {{ sheetLabel }}
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
                    @select="playChapter"
                />
                <MediaPlayerAbout
                    v-else
                    :content="content"
                    @read="openPage"
                />
            </div>
        </section>

        <!-- Rides on the menu: it moves down with it when the menu steps aside on scroll,
             stopping above the home indicator. -->
        <div
            v-if="!expanded"
            ref="bar"
            class="fixed inset-x-0 bottom-[var(--mobile-menu-h,0px)] z-40 flex w-full items-center justify-between gap-2 border-t-2 border-t-zinc-200/50 bg-zinc-100 px-2 pb-2 pt-2.5 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform dark:border-t-slate-700/50 dark:bg-slate-800 lg:bottom-5 lg:left-auto lg:right-5 lg:w-80 lg:translate-y-0 lg:overflow-hidden lg:rounded-lg lg:border-t-0 lg:shadow-lg"
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
