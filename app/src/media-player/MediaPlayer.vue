<script setup lang="ts">
/**
 * The app-wide media player: one player for audio and video, mounted once, that keeps playing
 * while the viewer browses. Full, it fills the space between the page's top bar and the mobile
 * menu, showing the picture or the cover with the transport; minimised, a bar riding on the menu. `VideoPlayer` stays mounted in the picture area for as long as an item
 * plays, so minimising never restarts it.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    ChevronDownIcon,
    FilmIcon,
    LanguageIcon,
    MusicalNoteIcon,
    PauseIcon,
    PlayIcon,
    XMarkIcon,
} from "@heroicons/vue/20/solid";
import { AUDIO_ONLY_ANGLE_ID } from "@luminary-media-converter/player-web";
import { db } from "luminary-shared";
import { DateTime } from "luxon";
import VideoPlayer from "@/components/content/VideoPlayer.vue";
import LImage from "@/components/images/LImage.vue";
import { useMobileChromeAutoHide } from "@/composables/useMobileChromeAutoHide";
import { isNativeApp } from "@/util/inAppBrowser";
import {
    closeMediaPlayer,
    expandMediaPlayer,
    mediaPlayerItem,
    mediaPlayerView,
    minimiseMediaPlayer,
    startsAsAudio,
} from "./mediaPlayer";

const { t } = useI18n();

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
    window.addEventListener("resize", measureTopBar);
    if (typeof ResizeObserver !== "undefined") barObserver = new ResizeObserver(publishBarHeight);
});
onBeforeUnmount(() => {
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
const progress = computed(() =>
    duration.value > 0 && Number.isFinite(duration.value)
        ? Math.min(currentTime.value / duration.value, 1)
        : 0,
);

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
    // The app shows video in its native full-screen only; the web shows it in the player.
    if (isNativeApp()) await handle.value?.enterFullscreen();
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

const openMenu = ref<"speed" | "language" | null>(null);
function toggleMenu(menu: "speed" | "language") {
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
const rateLabel = (rate: number) => `${rate}x`;

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
            class="fixed inset-x-0 bottom-[var(--mobile-menu-h,0px)] top-[var(--media-player-top,0px)] z-40 flex flex-col overflow-y-auto bg-amber-50 transition-transform duration-300 ease-out dark:bg-slate-800 lg:inset-auto lg:bottom-5 lg:right-5 lg:max-h-[90vh] lg:w-96 lg:rounded-2xl lg:shadow-2xl lg:shadow-black/20"
            :class="expanded ? 'translate-y-0' : 'pointer-events-none translate-y-[110vh]'"
            :style="{ '--media-player-top': `${topBarHeight}px` }"
            data-test="mediaPlayer"
            @keydown="onKeydown"
        >
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

            <div class="relative aspect-video w-full bg-black">
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
                        :fullscreen-on-play="isNativeApp()"
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

            <div class="space-y-1 px-6 pt-6 text-center">
                <span
                    v-if="content.author"
                    class="block truncate text-xs font-semibold uppercase tracking-[0.1rem] text-yellow-600"
                    >{{ content.author }}</span
                >
                <span class="block truncate text-lg font-bold text-zinc-600 dark:text-slate-300">{{
                    content.title
                }}</span>
                <span
                    v-if="publishDate"
                    class="block truncate text-xs font-semibold text-zinc-400"
                    >{{ publishDate }}</span
                >
            </div>

            <template v-if="state">
                <div
                    v-if="!live"
                    class="flex flex-col px-6 pt-6"
                >
                    <input
                        type="range"
                        min="0"
                        :max="duration || 0"
                        step="1"
                        :value="currentTime"
                        :aria-label="t('media_player.seek')"
                        class="h-1.5 w-full cursor-pointer accent-yellow-500"
                        data-test="mediaPlayerSeek"
                        @change="seekTo"
                    />
                    <div class="mt-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-300">
                        <span>{{ formatTime(currentTime) }}</span>
                        <span>{{ formatTime(duration) }}</span>
                    </div>
                </div>

                <div
                    class="flex items-center justify-center gap-6 pt-4 text-zinc-500 dark:text-slate-400"
                >
                    <button
                        v-if="!live"
                        type="button"
                        class="flex h-14 w-14 items-center justify-center"
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
                        @click="togglePlay"
                    >
                        <PauseIcon
                            v-if="playing"
                            class="h-12 w-12"
                        />
                        <PlayIcon
                            v-else
                            class="h-12 w-12"
                        />
                    </button>
                    <button
                        v-if="!live"
                        type="button"
                        class="flex h-14 w-14 items-center justify-center"
                        :aria-label="t('media_player.skip_forward', { seconds: SKIP_SECONDS })"
                        @click="skip(SKIP_SECONDS)"
                    >
                        <span
                            class="vjs-icon-forward-10 text-[40px] leading-none"
                            aria-hidden="true"
                        />
                    </button>
                </div>

                <div class="relative flex items-center justify-center gap-3 px-4 pb-6 pt-4">
                    <button
                        v-if="!live"
                        type="button"
                        class="h-11 rounded-full border border-zinc-500/35 px-4 text-sm font-semibold text-zinc-600 dark:text-slate-300"
                        :aria-label="t('media_player.speed')"
                        :aria-expanded="openMenu === 'speed'"
                        @click="toggleMenu('speed')"
                    >
                        {{ rateLabel(state.playbackRate) }}
                    </button>
                    <button
                        v-if="state.audioTracks.length > 1"
                        type="button"
                        class="flex h-11 items-center gap-1.5 rounded-full border border-zinc-500/35 px-4 text-sm font-semibold text-zinc-600 dark:text-slate-300"
                        :aria-label="t('media_player.language')"
                        :aria-expanded="openMenu === 'language'"
                        @click="toggleMenu('language')"
                    >
                        <LanguageIcon class="h-4 w-4" />
                        {{
                            state.audioTracks.find(
                                (track) => track.id === state?.activeAudioTrackId,
                            )?.label
                        }}
                    </button>

                    <ul
                        v-if="openMenu"
                        class="absolute bottom-full z-10 mb-1 w-40 overflow-hidden rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-slate-700"
                    >
                        <template v-if="openMenu === 'speed'">
                            <li
                                v-for="rate in [...RATES].reverse()"
                                :key="rate"
                            >
                                <button
                                    type="button"
                                    class="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-slate-600"
                                    :class="{ 'font-bold': rate === state.playbackRate }"
                                    @click="pickRate(rate)"
                                >
                                    {{ rateLabel(rate) }}
                                </button>
                            </li>
                        </template>
                        <template v-else>
                            <li
                                v-for="track in state.audioTracks"
                                :key="track.id"
                            >
                                <button
                                    type="button"
                                    class="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-slate-600"
                                    :class="{ 'font-bold': track.id === state.activeAudioTrackId }"
                                    @click="pickTrack(track.id)"
                                >
                                    {{ track.label }}
                                </button>
                            </li>
                        </template>
                    </ul>
                </div>
            </template>
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
