/**
 * The wash: the colour a ThumbHash gives a screen, worked out at every point rather than stretched from a small picture,
 * so it looks the same at any size. The whole hash fits inside the surface in its own proportions (never stretched or
 * squashed), so every one of its colours shows; past its edges it fades into its own average colour. Its colours are
 * its own; its light and shade are kept low (spread over a screen they read as a lit, 3D surface), and the whole of it
 * is darkened by one factor, only as far as white text needs. Static: nothing moves.
 *
 * Every platform draws the same function (a shader where it has one) and replays the same cases (`cases.json` here);
 * a change to the look changes them all.
 */

/** Share of the hash's light and shade kept. */
export const WASH_FLATTEN = 0.25;
/** How much its colour is lifted. */
export const WASH_CHROMA = 1;
/** How far past the picture's edge, in its own lengths, it has faded into its average. */
export const WASH_FADE = 0.5;
/** The grid the brightest point is looked for on: this many steps across and down the picture. */
export const WASH_PEAK_GRID = 16;

/** How dark: `dark` under white text on the player, `light` for a lighter screen. */
export type WashTone = "dark" | "light";

/** Luma (of sRGB values) the hash's average is brought down to, at most, and the brightest point of it. */
export const WASH_LUMA: Record<WashTone, { average: number; peak: number }> = {
    dark: { average: 0.36, peak: 0.46 },
    light: { average: 0.5, peak: 0.6 },
};

/** A term of the sum: the wave numbers across and down, and its weight. */
export type WashTerm = [cx: number, cy: number, weight: number];

/** A hash made ready to draw: what a shader is handed. */
export interface Wash {
    /** The flattened light's average, and the lifted colour's. */
    base: [l: number, p: number, q: number];
    /** The light's waves (weights flattened). */
    l: WashTerm[];
    /** The colour's waves: wave numbers, then P's and Q's weights (lifted). */
    pq: [cx: number, cy: number, p: number, q: number][];
    /** What every point is multiplied by, so the average and the brightest point are dark enough. */
    gain: number;
    /** The hash's picture's width over its height, which it keeps on any surface. */
    aspect: number;
}

/** At most this many light terms; a shader's arrays are this long. */
export const WASH_MAX_L_TERMS = 32;
/** The colour always has five. */
export const WASH_PQ_TERMS = 5;

/** Luma of sRGB values (not linear light): simple enough for every platform to compute alike. */
export function luma(r: number, g: number, b: number): number {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** L, P and Q as RGB, as ThumbHash converts them, times [gain], each then kept within 0–1. */
export function lpqToRgb(l: number, p: number, q: number, gain = 1): [number, number, number] {
    const b = l - (2 / 3) * p;
    const r = (3 * l - b + q) / 2;
    const g = r - q;
    const clamp = (v: number) => Math.max(0, Math.min(1, v * gain));
    return [clamp(r), clamp(g), clamp(b)];
}

/** The hash's bytes made ready to draw; null when they are not a ThumbHash. */
export function washOf(hash: Uint8Array, tone: WashTone = "dark"): Wash | null {
    if (hash.length < 5) return null;
    const header24 = hash[0]! | (hash[1]! << 8) | (hash[2]! << 16);
    const header16 = hash[3]! | (hash[4]! << 8);
    const lDc = (header24 & 63) / 63;
    const pDc = ((header24 >> 6) & 63) / 31.5 - 1;
    const qDc = ((header24 >> 12) & 63) / 31.5 - 1;
    const lScale = ((header24 >> 18) & 31) / 31;
    const hasAlpha = header24 >> 23;
    const pScale = ((header16 >> 3) & 63) / 63;
    const qScale = ((header16 >> 9) & 63) / 63;
    const isLandscape = header16 >> 15;
    const lx = Math.max(3, isLandscape ? (hasAlpha ? 5 : 7) : header16 & 7);
    const ly = Math.max(3, isLandscape ? header16 & 7 : hasAlpha ? 5 : 7);

    const acStart = hasAlpha ? 6 : 5;
    let acIndex = 0;
    let short = false;
    // Each term with its wave numbers; ThumbHash doubles every AC term when it decodes.
    const channel = (nx: number, ny: number, scale: number): WashTerm[] => {
        const terms: WashTerm[] = [];
        for (let cy = 0; cy < ny; cy++) {
            for (let cx = cy ? 0 : 1; cx * ny < nx * (ny - cy); cx++) {
                const byte = hash[acStart + (acIndex >> 1)];
                if (byte === undefined) short = true;
                const nibble = ((byte ?? 0) >> ((acIndex++ & 1) << 2)) & 15;
                terms.push([cx, cy, (nibble / 7.5 - 1) * scale * 2]);
            }
        }
        return terms;
    };
    const l = channel(lx, ly, lScale);
    const p = channel(3, 3, pScale * 1.25);
    const q = channel(3, 3, qScale * 1.25);
    if (short || l.length > WASH_MAX_L_TERMS || p.length !== WASH_PQ_TERMS) return null;

    const base: Wash["base"] = [lDc, pDc * WASH_CHROMA, qDc * WASH_CHROMA];
    const terms = {
        base,
        l: l.map(([cx, cy, w]): WashTerm => [cx, cy, w * WASH_FLATTEN]),
        pq: p.map(([cx, cy, w], i): Wash["pq"][number] => [
            cx,
            cy,
            w * WASH_CHROMA,
            q[i]![2] * WASH_CHROMA,
        ]),
    };
    // One gain for the whole wash, so its light and shade keep their proportions: found by a few fixed steps, as the
    // clamp comes after it, against the average and the brightest point on a fixed grid.
    const { average, peak } = WASH_LUMA[tone];
    const grid: [number, number, number][] = [];
    for (let y = 0; y <= WASH_PEAK_GRID; y++) {
        for (let x = 0; x <= WASH_PEAK_GRID; x++)
            grid.push(sum(terms, x / WASH_PEAK_GRID, y / WASH_PEAK_GRID));
    }
    let gain = 1;
    for (let step = 0; step < 8; step++) {
        const mean = luma(...lpqToRgb(...base, gain));
        const brightest = Math.max(...grid.map((lpq) => luma(...lpqToRgb(...lpq, gain))));
        if (mean <= average && brightest <= peak) break;
        gain *= Math.min(
            mean > average ? average / mean : 1,
            brightest > peak ? peak / brightest : 1,
        );
    }
    return { ...terms, gain, aspect: lx / ly };
}

/** L, P and Q of the picture at (u, v), each 0–1 across and down it. */
function sum(
    wash: Pick<Wash, "base" | "l" | "pq">,
    u: number,
    v: number,
): [number, number, number] {
    let [l, p, q] = wash.base;
    for (const [cx, cy, w] of wash.l)
        l += w * Math.cos(Math.PI * cx * u) * Math.cos(Math.PI * cy * v);
    for (const [cx, cy, wp, wq] of wash.pq) {
        const f = Math.cos(Math.PI * cx * u) * Math.cos(Math.PI * cy * v);
        p += wp * f;
        q += wq * f;
    }
    return [l, p, q];
}

/**
 * Where (u, v) on a surface [surfaceAspect] wide for its height falls on the hash's picture, which fits inside it,
 * centred, in its own proportions: along the surface's longer way the point may fall past the picture's edge.
 */
export function placeUv(wash: Wash, u: number, v: number, surfaceAspect: number): [number, number] {
    if (surfaceAspect > wash.aspect) return [0.5 + (u - 0.5) * (surfaceAspect / wash.aspect), v];
    return [u, 0.5 + (v - 0.5) * (wash.aspect / surfaceAspect)];
}

/** 0 at [edge0], 1 at [edge1], eased between. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

/**
 * The wash at (u, v), each 0–1 across and down a surface [surfaceAspect] wide for its height, as RGB 0–1, before any
 * dither. Past the picture's edge it is the edge's colour fading into the average over [WASH_FADE].
 */
export function washAt(
    wash: Wash,
    su: number,
    sv: number,
    surfaceAspect: number,
): [number, number, number] {
    const [u, v] = placeUv(wash, su, sv, surfaceAspect);
    const past = Math.max(-u, u - 1, -v, v - 1, 0);
    const [l, p, q] = sum(wash, Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v)));
    const t = smoothstep(0, WASH_FADE, past);
    const [bl, bp, bq] = wash.base;
    return lpqToRgb(l + (bl - l) * t, p + (bp - p) * t, q + (bq - q) * t, wash.gain);
}

/** The wash's average colour, as a flat fill for where it does not reach (the strip under a bar). */
export function washAverage(wash: Wash): [number, number, number] {
    return lpqToRgb(...wash.base, wash.gain);
}
