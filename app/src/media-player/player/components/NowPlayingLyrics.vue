<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { activeLyric, lyricArrow, type LyricCue } from "../ui/lyrics";
import { arrowDown, arrowUp } from "../ui/nowPlayingGlyphs";
import NowPlayingGlyph from "./NowPlayingGlyph.vue";
import { DEFAULT_MESSAGES } from "../messages";

/**
 * The words of what plays, in the picture's place on the now-playing screen: the line being sung large and bright,
 * the rest dim, the list keeping that line in the middle as the audio goes. A tap on a line goes there.
 */
const props = defineProps<{
    lines: readonly LyricCue[];
    currentTime: number;
    label: string;
    /** The name of the arrow that brings the list back to the line being sung. */
    backLabel?: string;
    /** Playing, and at what speed: the list keeps its own clock between the player's reports of the time. */
    playing?: boolean;
    rate?: number;
}>();

const emit = defineEmits<{ seek: [time: number] }>();

const listEl = ref<HTMLElement | null>(null);

/**
 * The player reports the time a few times a second, so a line timed by the reports alone lights up as late as the
 * gap between two. While it plays, the list runs on from the last report at the playback speed, frame by frame,
 * and takes each new report as it comes; never more than a report's gap ahead, should the reports stop.
 */
const MAX_AHEAD_S = 1;
/** Further behind than this, a report is a seek or a stall, and the list follows it. */
const MAX_BEHIND_S = 0.3;
const clock = ref(props.currentTime);
let reported = { time: props.currentTime, at: 0 };
let frame = 0;
const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
function tick(): void {
    frame = 0;
    if (!props.playing) return;
    const ahead = Math.min(MAX_AHEAD_S, ((now() - reported.at) / 1000) * (props.rate ?? 1));
    clock.value = reported.time + Math.max(0, ahead);
    frame = requestAnimationFrame(tick);
}
function run(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (props.playing && typeof requestAnimationFrame === "function")
        frame = requestAnimationFrame(tick);
}
watch(
    () => props.currentTime,
    (time) => {
        // A report a moment behind the list's own clock is the player catching up: kept from going back a line.
        const behind = clock.value - time;
        const start = props.playing && behind > 0 && behind < MAX_BEHIND_S ? clock.value : time;
        reported = { time: start, at: now() };
        clock.value = start;
    },
    { immediate: true },
);
watch(() => props.playing, run, { immediate: true });
onBeforeUnmount(() => {
    if (frame) cancelAnimationFrame(frame);
});

const active = computed(() => activeLyric(props.lines, clock.value));

/**
 * The list keeps the lit line in the middle until the viewer scrolls it (a fling after the finger lifts counts too);
 * then it stays where they left it, and an arrow offers the way back once the lit line is well out of view. The arrow,
 * or a tap on a line, has it follow again.
 */
const following = ref(true);
const arrow = ref<"up" | "down" | null>(null);
let fingerDown = false;
/** The viewer touched, wheeled or keyed the list since it last scrolled itself: a scroll now is theirs. */
let viewerInput = false;
/** Where the list last scrolled itself to, and whether it is still on its way there. */
let followTarget = -1;
let selfScrolling = false;

function lyricRows(): HTMLElement[] {
    return Array.from(listEl.value?.querySelectorAll<HTMLElement>("[data-lyric]") ?? []);
}

function follow(smooth: boolean): void {
    const list = listEl.value;
    const line = lyricRows()[active.value];
    if (!list || !line || !following.value) return;
    const most = Math.max(0, list.scrollHeight - list.clientHeight);
    const target = Math.round(
        Math.min(most, Math.max(0, line.offsetTop - list.clientHeight / 2 + line.offsetHeight / 2)),
    );
    if (!fingerDown) viewerInput = false;
    if (Math.abs(target - list.scrollTop) <= 1) return;
    const reduce =
        typeof matchMedia === "function" &&
        !!matchMedia("(prefers-reduced-motion: reduce)")?.matches;
    followTarget = target;
    selfScrolling = true;
    list.scrollTo?.({ top: target, behavior: smooth && !reduce ? "smooth" : "auto" });
}

function refreshArrow(): void {
    const list = listEl.value;
    const line = lyricRows()[active.value];
    if (following.value || !list || !line) {
        arrow.value = null;
        return;
    }
    const lineHeight =
        Number.parseFloat(getComputedStyle(line).lineHeight) || line.offsetHeight || 24;
    arrow.value = lyricArrow({
        rowTop: line.offsetTop,
        rowBottom: line.offsetTop + line.offsetHeight,
        viewTop: list.scrollTop,
        viewHeight: list.clientHeight,
        lineHeight,
    });
}

function onScroll(): void {
    const list = listEl.value;
    if (!list) return;
    if (selfScrolling && Math.abs(list.scrollTop - followTarget) <= 1) selfScrolling = false;
    else if (viewerInput && (fingerDown || !selfScrolling)) following.value = false;
    refreshArrow();
}
function onPress(): void {
    fingerDown = true;
    viewerInput = true;
    selfScrolling = false;
}
function onRelease(): void {
    fingerDown = false;
}
function onWheel(): void {
    viewerInput = true;
    selfScrolling = false;
}
function onKeydown(event: KeyboardEvent): void {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key))
        onWheel();
}

/** Back to the line being sung, and following it again. */
function returnToLine(): void {
    following.value = true;
    arrow.value = null;
    follow(true);
}
function pick(line: LyricCue): void {
    following.value = true;
    arrow.value = null;
    emit("seek", line.start);
}

watch(active, async () => {
    await nextTick();
    follow(true);
    refreshArrow();
});
// An equal list handed over again (a text track re-read on every cue change) leaves the scroll where it is.
watch(
    () => props.lines.map((line) => `${line.start}\u0000${line.text}`).join("\u0001"),
    async () => {
        await nextTick();
        follow(false);
    },
    { immediate: true },
);
// A new size (the phone turned) moves the lines: the lit one is put back in the middle.
let sizeObserver: ResizeObserver | null = null;
onMounted(() => {
    if (typeof ResizeObserver === "undefined" || !listEl.value) return;
    sizeObserver = new ResizeObserver(() => {
        follow(false);
        refreshArrow();
    });
    sizeObserver.observe(listEl.value);
});
onBeforeUnmount(() => sizeObserver?.disconnect());
</script>

<template>
    <div class="lmpl-afs-lyricsbox">
        <ol
            ref="listEl"
            class="lmpl-afs-lyrics"
            :aria-label="label"
            data-test="afsLyrics"
            @scroll.passive="onScroll"
            @wheel.passive="onWheel"
            @touchstart.passive="onPress"
            @touchend.passive="onRelease"
            @touchcancel.passive="onRelease"
            @pointerdown="onPress"
            @pointerup="onRelease"
            @pointercancel="onRelease"
            @keydown="onKeydown"
        >
            <li
                v-for="(line, i) in lines"
                :key="`${line.start}-${i}`"
            >
                <button
                    type="button"
                    class="lmpl-afs-lyric"
                    :class="{ 'lmpl-afs-lyric-now': i === active }"
                    :aria-current="i === active ? 'true' : undefined"
                    data-lyric
                    @click="pick(line)"
                >
                    {{ line.text }}
                </button>
            </li>
        </ol>
        <button
            v-if="arrow"
            type="button"
            class="lmpl-afs-lyricsback"
            :class="`lmpl-afs-lyricsback-${arrow}`"
            :aria-label="backLabel ?? DEFAULT_MESSAGES.backToLine"
            :data-arrow="arrow"
            data-test="afsLyricsBack"
            @click="returnToLine"
        >
            <NowPlayingGlyph
                :glyph="arrow === 'up' ? arrowUp : arrowDown"
                :size="22"
            />
        </button>
    </div>
</template>
