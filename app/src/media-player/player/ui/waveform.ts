import { shallowRef, watch, type Ref } from "vue";
import { thumbHashToRGBA } from "thumbhash";

/** The `waveform.json` format this reads; another version describes a different timeline. */
export const WAVEFORM_VERSION = 2;

/** About one scrub frame's width: the waveform moves under a finger at the filmstrip's speed. */
export const WAVE_TILE_PX = 64;
export const WAVE_BAR_PX = 3;
/** As wide as a bar, so each one reads on its own rather than the strip running together. */
export const WAVE_GAP_PX = 3;
/** What has not played yet is drawn this faint; what has, solid. */
export const WAVE_UNPLAYED_ALPHA = 0.35;
/** Over the frames the wave rises from their foot: a light veil with a brighter edge, low, so every frame stays readable. */
export const WAVE_OVER_FRAMES_FILL = 0.3;
export const WAVE_OVER_FRAMES_UNPLAYED_FILL = 0.16;
export const WAVE_OVER_FRAMES_EDGE = 0.85;
export const WAVE_OVER_FRAMES_UNPLAYED_EDGE = 0.45;
export const WAVE_OVER_FRAMES_HEIGHT = 0.55;
/** The bars' rise from the centre line when the waveform opens. */
export const WAVE_ENTER_MS = 250;
/** Silence still draws a dot, so the strip reads as a timeline rather than a gap. */
export const WAVE_MIN_AMP = 0.06;
/** Heights are eased by this power, so quiet stretches sit low and the loud ones stand out. */
export const WAVE_CURVE = 1.6;
/** Seconds either side of a bar its height is also measured against, so a loud stretch still shows its rises and dips. */
export const WAVE_LOCAL_SECONDS = 15;
/** How much of a bar's height comes from its neighbourhood rather than the whole recording. */
export const WAVE_LOCAL_WEIGHT = 0.6;
/**
 * A fixed variation per bar, up to this share of its height. The sidecar holds about one peak every few seconds on a
 * long recording, so neighbouring bars would otherwise stand at one height and run together. 0 turns it off.
 */
export const WAVE_TEXTURE = 0.3;

/** A loudness curve over the whole item: `peaks` spread evenly from its start to its end. */
export interface Waveform {
    peaks: number[];
    /** The recording's quiet floor and loud ceiling, which the bars' heights are stretched between. */
    low: number;
    high: number;
}

/** The waveform in a `waveform.json`, or null for anything this cannot draw. */
export function parseWaveform(json: unknown): Waveform | null {
    if (!json || typeof json !== "object") return null;
    const { version, peaks } = json as { version?: unknown; peaks?: unknown };
    if (version !== WAVEFORM_VERSION || !Array.isArray(peaks) || peaks.length === 0) return null;
    if (!peaks.every((peak) => typeof peak === "number" && Number.isFinite(peak))) return null;
    return { peaks, ...waveformLevels(peaks) };
}

/**
 * The quiet floor (10th percentile) and loud ceiling (97th) of a recording. Stretching between them rather than
 * scaling by the loudest peak keeps speech from piling up at full height, where every bar looks alike.
 */
export function waveformLevels(peaks: readonly number[]): { low: number; high: number } {
    const sorted = [...peaks].sort((a, b) => a - b);
    const at = (q: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
    const loudest = sorted[sorted.length - 1] ?? 0;
    if (!(loudest > 0)) return { low: 0, high: 1 };
    const low = at(0.1);
    const high = at(0.97);
    return high > low ? { low, high } : { low: 0, high: loudest };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * A level as a bar's height: stretched between the recording's floor and ceiling and, when given, the quietest and
 * loudest peaks around it; eased; never under the dot. `texture` (0..1) takes up to `WAVE_TEXTURE` of it away.
 */
export function waveHeight(
    waveform: Waveform,
    level: number,
    around?: { low: number; high: number },
    texture = 0,
): number {
    const global = clamp01((level - waveform.low) / (waveform.high - waveform.low));
    const span = around ? around.high - around.low : 0;
    const t =
        around && span > (waveform.high - waveform.low) * 0.05
            ? (1 - WAVE_LOCAL_WEIGHT) * global +
              WAVE_LOCAL_WEIGHT * clamp01((level - around.low) / span)
            : global;
    return WAVE_MIN_AMP + (1 - WAVE_MIN_AMP) * t ** WAVE_CURVE * (1 - WAVE_TEXTURE * texture);
}

/** The quietest and loudest peaks within `radius` peaks of `centre`. */
export function waveAround(
    peaks: readonly number[],
    centre: number,
    radius: number,
): { low: number; high: number } {
    const a = Math.max(0, Math.floor(centre - radius));
    const b = Math.min(peaks.length - 1, Math.ceil(centre + radius));
    let low = Infinity;
    let high = -Infinity;
    for (let i = a; i <= b; i++) {
        if (peaks[i] < low) low = peaks[i];
        if (peaks[i] > high) high = peaks[i];
    }
    return low <= high ? { low, high } : { low: 0, high: 0 };
}

/** A steady pseudo-random 0..1 per bar slot, so a bar keeps its texture as the strip slides. */
export function waveTexture(slot: number): number {
    const x = Math.sin(slot * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
}

/**
 * The level over a stretch of the peaks, `from` to `to` as fractional peak indices. Narrower than a peak, it is read
 * off the curve between neighbouring peaks, so bars next to each other differ rather than repeat a step; wider, it
 * blends the stretch's mean with its loudest so a short word still shows.
 */
export function waveLevel(peaks: readonly number[], from: number, to: number): number {
    const last = peaks.length - 1;
    if (last < 0) return 0;
    const sample = (i: number) => {
        const x = Math.min(last, Math.max(0, i - 0.5));
        const i0 = Math.floor(x);
        const i1 = Math.min(last, i0 + 1);
        const f = x - i0;
        // Smoothstep, so the curve through the peaks has no corners.
        const e = f * f * (3 - 2 * f);
        return peaks[i0] + (peaks[i1] - peaks[i0]) * e;
    };
    if (to - from <= 1) return sample((from + to) / 2);
    const a = Math.max(0, Math.floor(from));
    const b = Math.min(last, Math.ceil(to) - 1);
    let sum = 0;
    let loudest = 0;
    for (let i = a; i <= b; i++) {
        sum += peaks[i];
        if (peaks[i] > loudest) loudest = peaks[i];
    }
    return 0.5 * (sum / (b - a + 1)) + 0.5 * loudest;
}

/** The bars' tint: light enough to read on the dark wash, with no more colour than this. */
export const WAVE_TINT_LIGHTNESS = 0.7;
export const WAVE_TINT_SATURATION = 0.95;
/** A thumbhash's colours are muted; they are brought up this much before the cap. */
export const WAVE_TINT_BOOST = 3;

/**
 * The artwork's colours across the strip, left to right, as light tints for the bars: the waveform takes on the
 * picture's colour as the wash behind it does, and stays legible. Null without a hash, or for one that will not decode.
 */
export function waveTint(hash: string | null | undefined): string[] | null {
    if (!hash) return null;
    try {
        const bytes = Uint8Array.from(atob(hash), (char) => char.charCodeAt(0));
        const { w, h, rgba } = thumbHashToRGBA(bytes);
        const row = Math.floor(h / 2);
        return [0, 0.25, 0.5, 0.75, 1].map((f) => {
            const i = (row * w + Math.round(f * (w - 1))) * 4;
            return lightTint(rgba[i], rgba[i + 1], rgba[i + 2]);
        });
    } catch {
        return null;
    }
}

/** A colour's hue, at the tint's lightness and no more than its saturation. */
function lightTint(r: number, g: number, b: number): string {
    const [rr, gg, bb] = [r / 255, g / 255, b / 255];
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let hue = 0;
    if (d !== 0) {
        if (max === rr) hue = ((gg - bb) / d) % 6;
        else if (max === gg) hue = (bb - rr) / d + 2;
        else hue = (rr - gg) / d + 4;
    }
    hue = Math.round((((hue * 60) % 360) + 360) % 360);
    const sat = Math.round(Math.min(s * WAVE_TINT_BOOST, WAVE_TINT_SATURATION) * 100);
    return `hsl(${hue} ${sat}% ${Math.round(WAVE_TINT_LIGHTNESS * 100)}%)`;
}

/** One bar: its left edge in px from the strip's left, and its height as a fraction of the strip's. */
export interface WaveBar {
    key: number;
    x: number;
    amp: number;
}

export interface WaveLayout {
    /** The time under the marker, on the playing copy's timeline. */
    time: number;
    markerX: number;
    width: number;
    /** The playing copy's duration. */
    duration: number;
    /** Seconds `WAVE_TILE_PX` stands for: the filmstrip's fine step. */
    step: number;
    /** A download's own, shorter timeline mapped to the full item's, which the peaks span. */
    toFull?: (time: number) => number;
    /** The full item's duration; the playing copy's when omitted. */
    fullDuration?: number;
    /** Over frames, the frames' own scale, so each bar stands over its moment; `WAVE_TILE_PX / step` otherwise. */
    pxPerSecond?: number;
}

/**
 * The bars of a waveform that slides under a fixed marker. Bars are fixed in time, so while the playhead moves each
 * keeps its height and only its position changes: the strip scrolls rather than shimmers.
 */
export function waveBars(waveform: Waveform, layout: WaveLayout): WaveBar[] {
    const { time, markerX, width, duration, step } = layout;
    if (!(duration > 0) || !(step > 0) || !(width > 0)) return [];
    const pxPerSecond = layout.pxPerSecond ?? WAVE_TILE_PX / step;
    const pitch = WAVE_BAR_PX + WAVE_GAP_PX;
    const barSeconds = pitch / pxPerSecond;
    const toFull = layout.toFull ?? ((t: number) => t);
    const fullDuration = layout.fullDuration ?? duration;
    const peaks = waveform.peaks;
    const index = (t: number) => (toFull(t) / fullDuration) * peaks.length;
    const radius = Math.max(1, (WAVE_LOCAL_SECONDS / fullDuration) * peaks.length);

    const first = Math.max(0, Math.floor((time - markerX / pxPerSecond) / barSeconds));
    const last = Math.min(
        Math.ceil(duration / barSeconds) - 1,
        Math.ceil((time + (width - markerX) / pxPerSecond) / barSeconds),
    );
    const bars: WaveBar[] = [];
    for (let k = first; k <= last; k++) {
        const start = k * barSeconds;
        const end = Math.min(duration, start + barSeconds);
        bars.push({
            key: k,
            x: markerX + (start - time) * pxPerSecond,
            amp: waveHeight(
                waveform,
                waveLevel(peaks, index(start), index(end)),
                waveAround(peaks, (index(start) + index(end)) / 2, radius),
                waveTexture(k),
            ),
        });
    }
    return bars;
}

/** The answers for each waveform URL this session: a waveform is the same file for as long as the URL is. */
const cache = new Map<string, Promise<Waveform | null>>();

function load(url: string): Promise<Waveform | null> {
    let pending = cache.get(url);
    if (!pending) {
        pending = fetch(url)
            .then((response) => (response.ok ? response.json() : null))
            .then(parseWaveform)
            .catch(() => null);
        // A miss offline may answer later: only a waveform is kept.
        pending.then((waveform) => waveform || cache.delete(url));
        cache.set(url, pending);
    }
    return pending;
}

/** The waveform at `url`, or null while it loads and when there is none to draw. */
export function useWaveform(url: Ref<string | undefined>): Ref<Waveform | null> {
    const waveform = shallowRef<Waveform | null>(null);
    watch(
        url,
        async (next) => {
            waveform.value = null;
            if (!next) return;
            const loaded = await load(next);
            if (url.value === next) waveform.value = loaded;
        },
        { immediate: true },
    );
    return waveform;
}

/** For tests: forget every answer. */
export function clearWaveformCache(): void {
    cache.clear();
}
