<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
    WAVE_BAR_PX,
    WAVE_ENTER_MS,
    WAVE_OVER_FRAMES_EDGE,
    WAVE_OVER_FRAMES_FILL,
    WAVE_OVER_FRAMES_HEIGHT,
    WAVE_OVER_FRAMES_UNPLAYED_EDGE,
    WAVE_OVER_FRAMES_UNPLAYED_FILL,
    WAVE_UNPLAYED_ALPHA,
    type WaveBar,
} from "../ui/waveform";

/**
 * The waveform around the playhead, sliding past a marker that stays put: rounded bars in the filmstrip's place while
 * the timeline of sound alone is held, a smooth wave rising from the foot of a video's frames. Drawn on a canvas, since it moves
 * every frame while it plays.
 */
const props = defineProps<{
    bars: WaveBar[];
    /** Where the marker sits, in px from the strip's left. */
    markerX: number;
    height: number;
    /** Gap, in px, between the screen's bottom edge and the strip's. */
    bottom?: number;
    /** Drawn over the frames of a filmstrip, blended into them, rather than as a strip of its own. */
    overFrames?: boolean;
    /** A pinned strip takes the pointer, to be dragged. */
    interactive?: boolean;
    /** The strip's left edge and width, in px; the full width when omitted. */
    left?: number;
    stripWidth?: number;
    /** Colours across the strip, left to right, for the bars; plain white without. */
    tint?: string[] | null;
}>();

const rootEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const width = ref(0);
let observer: ResizeObserver | null = null;

const reducedMotion = () =>
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** 0 to 1 while the bars rise from the centre line, left to right; 1 once they stand. */
let enter = reducedMotion() ? 1 : 0;
let enterStart = 0;
let enterFrame = 0;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
function runEnter(now: number): void {
    if (!enterStart) enterStart = now;
    enter = Math.min(1, (now - enterStart) / WAVE_ENTER_MS);
    draw();
    enterFrame = enter < 1 ? requestAnimationFrame(runEnter) : 0;
}

/** A bar's own share of the rise: the left edge starts first, the right a little after. */
function rise(x: number): number {
    if (enter >= 1) return 1;
    const lag = width.value > 0 ? Math.min(1, Math.max(0, x / width.value)) * 0.4 : 0;
    return easeOut(Math.min(1, Math.max(0, (enter - lag) / 0.6)));
}

/**
 * The wave's top edge: a smooth curve through each sample's height above the strip's foot. `closed` runs it back
 * along the foot, for the fill; open, it is the edge alone.
 */
function tracePath(
    context: CanvasRenderingContext2D,
    foot: number,
    tallest: number,
    closed: boolean,
): boolean {
    const points = props.bars.map((bar) => ({
        x: bar.x + WAVE_BAR_PX / 2,
        h: Math.max(1, bar.amp * tallest * rise(bar.x)),
    }));
    if (points.length < 2) return false;
    context.beginPath();
    context.moveTo(points[0].x, foot - points[0].h);
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        context.quadraticCurveTo(a.x, foot - a.h, (a.x + b.x) / 2, foot - (a.h + b.h) / 2);
    }
    const last = points[points.length - 1];
    context.lineTo(last.x, foot - last.h);
    if (closed) {
        context.lineTo(last.x, foot);
        context.lineTo(points[0].x, foot);
        context.closePath();
    }
    return true;
}

function draw(): void {
    const canvas = canvasEl.value;
    const context = canvas?.getContext?.("2d");
    if (!canvas || !context || !(width.value > 0)) return;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(width.value * ratio);
    const h = Math.round(props.height * ratio);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width.value, props.height);
    const tint = props.tint;
    let paint: string | CanvasGradient = getComputedStyle(canvas).color || "#fff";
    if (tint && tint.length > 1 && !props.overFrames) {
        const gradient = context.createLinearGradient(0, 0, width.value, 0);
        tint.forEach((colour, i) => gradient.addColorStop(i / (tint.length - 1), colour));
        paint = gradient;
    }
    if (!props.overFrames) return drawBars(context, paint, props.height / 2, props.height * 0.78);
    const foot = props.height;
    const tallest = props.height * WAVE_OVER_FRAMES_HEIGHT;
    if (props.bars.length < 2) return;
    context.fillStyle = paint;
    context.strokeStyle = paint;
    context.lineWidth = 1.5;
    context.lineJoin = "round";
    // What has played, left of the marker, and what has not, each with its own strength.
    const sides = [
        { from: 0, to: props.markerX, played: true },
        { from: props.markerX, to: width.value, played: false },
    ];
    for (const side of sides) {
        if (side.to <= side.from) continue;
        context.save();
        context.beginPath();
        context.rect(side.from, 0, side.to - side.from, props.height);
        context.clip();
        tracePath(context, foot, tallest, true);
        context.globalAlpha = side.played ? WAVE_OVER_FRAMES_FILL : WAVE_OVER_FRAMES_UNPLAYED_FILL;
        context.fill();
        tracePath(context, foot, tallest, false);
        context.globalAlpha = side.played ? WAVE_OVER_FRAMES_EDGE : WAVE_OVER_FRAMES_UNPLAYED_EDGE;
        context.stroke();
        context.restore();
    }
    context.globalAlpha = 1;
}

/** Sound alone's strip: rounded bars, solid where it has played and faint where it has not. */
function drawBars(
    context: CanvasRenderingContext2D,
    paint: string | CanvasGradient,
    middle: number,
    tallest: number,
): void {
    context.fillStyle = paint;
    const radius = WAVE_BAR_PX / 2;
    for (const bar of props.bars) {
        if (bar.x + WAVE_BAR_PX < 0 || bar.x > width.value) continue;
        const tall = Math.max(WAVE_BAR_PX, bar.amp * tallest * rise(bar.x));
        context.globalAlpha = bar.x + WAVE_BAR_PX / 2 <= props.markerX ? 1 : WAVE_UNPLAYED_ALPHA;
        context.beginPath();
        if (context.roundRect)
            context.roundRect(bar.x, middle - tall / 2, WAVE_BAR_PX, tall, radius);
        else context.rect(bar.x, middle - tall / 2, WAVE_BAR_PX, tall);
        context.fill();
    }
    context.globalAlpha = 1;
}

watch(() => [props.bars, props.markerX, props.height, props.tint, width.value], draw, {
    flush: "post",
});

onMounted(() => {
    const root = rootEl.value;
    if (!root) return;
    width.value = root.getBoundingClientRect().width;
    if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => {
            width.value = root.getBoundingClientRect().width;
        });
        observer.observe(root);
    }
    if (enter < 1 && typeof requestAnimationFrame === "function")
        enterFrame = requestAnimationFrame(runEnter);
    else enter = 1;
    draw();
});

onBeforeUnmount(() => {
    observer?.disconnect();
    if (enterFrame) cancelAnimationFrame(enterFrame);
});
</script>

<template>
    <div
        ref="rootEl"
        class="lmpl-wave"
        :class="{ 'lmpl-wave-interactive': interactive, 'lmpl-wave-over-frames': overFrames }"
        :style="{
            ...(overFrames ? {} : { bottom: `${bottom ?? 0}px`, height: `${height}px` }),
            ...(stripWidth
                ? { left: `${left ?? 0}px`, right: 'auto', width: `${stripWidth}px` }
                : {}),
        }"
        :aria-hidden="interactive ? undefined : 'true'"
    >
        <canvas ref="canvasEl" class="lmpl-wave-canvas"></canvas>
        <div v-if="!overFrames" class="lmpl-roster-marker" :style="{ left: `${markerX}px` }"></div>
    </div>
</template>
