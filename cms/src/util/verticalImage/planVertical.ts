/**
 * Decides how to turn a photo into a vertical (3:4) image: a plain crop around the subject, or the
 * whole subject placed on a blurred copy of the photo when it is too wide for a crop.
 *
 * Pure and environment-free (no DOM, no sharp) so the same plan can drive the CMS canvas renderer
 * now and a sharp renderer in the API later: sharp's `.raw()` output is a valid {@link RgbaImage}.
 */

export type RgbaImage = {
    /** RGBA bytes, row by row, 4 per pixel. */
    data: Uint8ClampedArray | Uint8Array;
    width: number;
    height: number;
};

export type Box = { left: number; top: number; width: number; height: number };

export type VerticalStrategy = "crop" | "blur-fill";

export type VerticalOptions = {
    /** Output width in px; the height follows from `aspectRatio`. */
    width?: number;
    /** Output width / height. */
    aspectRatio?: number;
    strategy?: "auto" | VerticalStrategy;
    /** Share of the image's detail the subject must hold to decide crop vs blur-fill (0..1). */
    subjectShare?: number;
    /** Share kept sharp when blur-filling; near 1 so no one at the edge of a group is cut off. */
    fillShare?: number;
    /** Extra room kept around the subject when blur-filling, as a share of the source width. */
    padding?: number;
    /** Where the photo sits when blur-filling: 0 = top, 1 = bottom. */
    verticalPosition?: number;
};

export type VerticalPlan = {
    strategy: VerticalStrategy;
    width: number;
    height: number;
    /** Region of the source drawn sharp, in source pixels. */
    cropBox: Box;
    /** Where `cropBox` lands in the output; it keeps the crop's aspect ratio, never stretched. */
    placement: Box;
    /** The detected subject along the cropped axis, in source pixels. */
    subject: { start: number; end: number };
};

export const VERTICAL_DEFAULTS: Required<VerticalOptions> = {
    width: 1080,
    aspectRatio: 3 / 4,
    strategy: "auto",
    subjectShare: 0.85,
    fillShare: 0.98,
    padding: 0.04,
    verticalPosition: 0.5,
};

/**
 * Plans the vertical image for a source of `sourceSize`, using `analysis` (a small copy of the
 * same photo, ~128 px on its long side is plenty) to find the subject.
 */
export function planVertical(
    analysis: RgbaImage,
    sourceSize: { width: number; height: number },
    options: VerticalOptions = {},
): VerticalPlan {
    const o = { ...VERTICAL_DEFAULTS, ...options };
    const width = Math.round(o.width);
    const height = Math.round(o.width / o.aspectRatio);
    const W = sourceSize.width;
    const H = sourceSize.height;
    const output: Box = { left: 0, top: 0, width, height };

    const { columns, rows } = detailProfiles(analysis);

    // Already as narrow as the target (or narrower): only the height needs trimming.
    if (W / H <= o.aspectRatio) {
        const cropH = Math.min(H, W / o.aspectRatio);
        const [start, end] = scaleWindow(subjectWindow(rows, o.subjectShare), rows.length, H);
        const top = clamp((start + end) / 2 - cropH / 2, 0, H - cropH);
        return {
            strategy: "crop",
            width,
            height,
            cropBox: roundBox({ left: 0, top, width: W, height: cropH }),
            placement: output,
            subject: { start: Math.round(start), end: Math.round(end) },
        };
    }

    const cropW = H * o.aspectRatio;
    const [start, end] = scaleWindow(subjectWindow(columns, o.subjectShare), columns.length, W);
    const subject = { start: Math.round(start), end: Math.round(end) };
    const strategy: VerticalStrategy =
        o.strategy === "auto" ? (end - start <= cropW ? "crop" : "blur-fill") : o.strategy;

    if (strategy === "crop") {
        const left = clamp((start + end) / 2 - cropW / 2, 0, W - cropW);
        return {
            strategy,
            width,
            height,
            cropBox: roundBox({ left, top: 0, width: cropW, height: H }),
            placement: output,
            subject,
        };
    }

    // Narrow to the padded subject, but never below a full-height crop, which would overflow the
    // output's height once scaled to its width.
    const [fillStart, fillEnd] = scaleWindow(
        subjectWindow(columns, o.fillShare),
        columns.length,
        W,
    );
    const pad = o.padding * W;
    let left = Math.max(0, Math.min(start, fillStart) - pad);
    let right = Math.min(W, Math.max(end, fillEnd) + pad);
    if (right - left < cropW) {
        const centre = (left + right) / 2;
        left = clamp(centre - cropW / 2, 0, W - cropW);
        right = left + cropW;
    }
    const cropBox = roundBox({ left, top: 0, width: right - left, height: H });
    const placedHeight = Math.min(height, Math.round((H * width) / cropBox.width));
    const top = Math.round((height - placedHeight) * clamp(o.verticalPosition, 0, 1));
    return {
        strategy,
        width,
        height,
        cropBox,
        placement: { left: 0, top, width, height: placedHeight },
        subject,
    };
}

/**
 * Per-column and per-row detail (luminance edges) of the analysis image. Edges mark people and
 * objects; soft or out-of-focus backgrounds, typical of our photos, carry little.
 */
export function detailProfiles(image: RgbaImage): { columns: number[]; rows: number[] } {
    const { data, width, height } = image;
    const luma = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
        luma[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }
    const columns = new Array<number>(width).fill(0);
    const rows = new Array<number>(height).fill(0);
    for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width - 1; x++) {
            const i = y * width + x;
            const edge = Math.abs(luma[i + 1] - luma[i]) + Math.abs(luma[i + width] - luma[i]);
            columns[x] += edge;
            rows[y] += edge;
        }
    }
    return { columns, rows };
}

/**
 * The narrowest run of entries `[start, end)` holding `share` of the profile's total. Half the
 * median is subtracted first so evenly textured backgrounds (foliage, gravel) do not widen it.
 */
export function subjectWindow(profile: number[], share: number): [number, number] {
    const n = profile.length;
    if (n === 0) return [0, 0];
    const sorted = [...profile].sort((a, b) => a - b);
    const floor = sorted[Math.floor(n / 2)] / 2;
    const weights = profile.map((v) => Math.max(0, v - floor));
    const total = weights.reduce((sum, v) => sum + v, 0);
    if (total === 0) return [0, n];

    const target = total * share;
    let best: [number, number] = [0, n];
    let sum = 0;
    let start = 0;
    for (let end = 0; end < n; end++) {
        sum += weights[end];
        while (sum - weights[start] >= target) {
            sum -= weights[start];
            start++;
        }
        if (sum >= target && end + 1 - start < best[1] - best[0]) best = [start, end + 1];
    }
    return best;
}

function scaleWindow([start, end]: [number, number], from: number, to: number): [number, number] {
    return [(start / from) * to, (end / from) * to];
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function roundBox(box: Box): Box {
    return {
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height),
    };
}
