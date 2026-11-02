<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { activeLyric, type LyricCue } from "../ui/lyrics";

/**
 * The words of what plays, in the picture's place on the now-playing screen: the line being sung large and bright,
 * the rest dim, the list keeping that line in the middle as the audio goes. A tap on a line goes there.
 */
const props = defineProps<{
    lines: readonly LyricCue[];
    currentTime: number;
    label: string;
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

/** A viewer reading ahead or back is left there for a while before the list follows the audio again. */
const HANDS_OFF_MS = 4000;
let touchedAt = -Infinity;
const touched = (): void => {
    touchedAt = performance.now();
};

function follow(smooth: boolean): void {
    const list = listEl.value;
    const line = list?.querySelectorAll<HTMLElement>("[data-lyric]")[active.value];
    if (!list || !line) return;
    if (performance.now() - touchedAt < HANDS_OFF_MS) return;
    const reduce =
        typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = line.offsetTop - list.clientHeight / 2 + line.offsetHeight / 2;
    list.scrollTo?.({ top: Math.max(0, top), behavior: smooth && !reduce ? "smooth" : "auto" });
}

watch(active, async () => {
    await nextTick();
    follow(true);
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
onBeforeUnmount(() => {
    touchedAt = -Infinity;
});
</script>

<template>
    <ol
        ref="listEl"
        class="lmpl-afs-lyrics"
        :aria-label="label"
        data-test="afsLyrics"
        @wheel.passive="touched"
        @touchstart.passive="touched"
        @pointerdown="touched"
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
                @click="emit('seek', line.start)"
            >
                {{ line.text }}
            </button>
        </li>
    </ol>
</template>
