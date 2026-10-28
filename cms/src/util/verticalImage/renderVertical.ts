import {
    planVertical,
    type RgbaImage,
    type VerticalOptions,
    type VerticalPlan,
} from "./planVertical";

const ANALYSIS_SIZE = 128;
const BLUR_SHRINK = 24;
const BACKGROUND_DARKEN = 0.2;

export type VerticalRenderOptions = VerticalOptions & {
    /** Px of gradient blend on the photo's top and bottom edges when blur-filling. */
    feather?: number;
    /** Encoder quality, 0..1. */
    quality?: number;
};

export type VerticalResult = { blob: Blob; plan: VerticalPlan };

/** Renders the vertical version of an image in the browser, via a canvas. */
export async function renderVertical(
    source: Blob,
    options: VerticalRenderOptions = {},
): Promise<VerticalResult> {
    const bitmap = await createImageBitmap(source);
    try {
        const plan = planVertical(analysisImage(bitmap), bitmap, options);
        const canvas = createCanvas(plan.width, plan.height);
        const ctx = canvas.getContext("2d")!;
        ctx.imageSmoothingQuality = "high";

        if (plan.strategy === "blur-fill") {
            drawBlurredBackground(ctx, bitmap, plan);
            drawFeathered(ctx, bitmap, plan, options.feather ?? 120);
        } else {
            const { left, top, width, height } = plan.cropBox;
            ctx.drawImage(bitmap, left, top, width, height, 0, 0, plan.width, plan.height);
        }

        return { blob: await toBlob(canvas, options.quality ?? 0.85), plan };
    } finally {
        bitmap.close();
    }
}

function analysisImage(bitmap: ImageBitmap): RgbaImage {
    const scale = ANALYSIS_SIZE / Math.max(bitmap.width, bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = createCanvas(width, height).getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
}

/**
 * The whole photo, cover-scaled and centred on the subject, then blurred by drawing it tiny and
 * scaling it back up — cheaper than a blur filter and works on every browser canvas.
 */
function drawBlurredBackground(
    ctx: CanvasRenderingContext2D,
    bitmap: ImageBitmap,
    plan: VerticalPlan,
) {
    const scale = Math.max(plan.width / bitmap.width, plan.height / bitmap.height);
    const coverWidth = bitmap.width * scale;
    const coverHeight = bitmap.height * scale;
    const subjectCentre = ((plan.subject.start + plan.subject.end) / 2) * scale;
    const left = Math.min(0, Math.max(plan.width - coverWidth, plan.width / 2 - subjectCentre));
    const top = (plan.height - coverHeight) / 2;

    const small = createCanvas(
        Math.max(1, Math.round(plan.width / BLUR_SHRINK)),
        Math.max(1, Math.round(plan.height / BLUR_SHRINK)),
    );
    const smallCtx = small.getContext("2d")!;
    smallCtx.imageSmoothingQuality = "high";
    const shrink = small.width / plan.width;
    smallCtx.drawImage(
        bitmap,
        left * shrink,
        top * shrink,
        coverWidth * shrink,
        coverHeight * shrink,
    );

    ctx.drawImage(small, 0, 0, plan.width, plan.height);
    ctx.fillStyle = `rgba(0, 0, 0, ${BACKGROUND_DARKEN})`;
    ctx.fillRect(0, 0, plan.width, plan.height);
}

/** The sharp photo, with its top and bottom edges faded into the background where there is a gap. */
function drawFeathered(
    ctx: CanvasRenderingContext2D,
    bitmap: ImageBitmap,
    plan: VerticalPlan,
    feather: number,
) {
    const { cropBox, placement } = plan;
    const layer = createCanvas(placement.width, placement.height);
    const layerCtx = layer.getContext("2d")!;
    layerCtx.imageSmoothingQuality = "high";
    layerCtx.drawImage(
        bitmap,
        cropBox.left,
        cropBox.top,
        cropBox.width,
        cropBox.height,
        0,
        0,
        placement.width,
        placement.height,
    );

    const fade = Math.min(feather, placement.height / 4) / placement.height;
    const fadeTop = placement.top > 0 ? fade : 0;
    const fadeBottom = placement.top + placement.height < plan.height ? fade : 0;
    if (fadeTop || fadeBottom) {
        const mask = layerCtx.createLinearGradient(0, 0, 0, placement.height);
        mask.addColorStop(0, `rgba(0, 0, 0, ${fadeTop ? 0 : 1})`);
        mask.addColorStop(fadeTop, "rgba(0, 0, 0, 1)");
        mask.addColorStop(1 - fadeBottom, "rgba(0, 0, 0, 1)");
        mask.addColorStop(1, `rgba(0, 0, 0, ${fadeBottom ? 0 : 1})`);
        layerCtx.globalCompositeOperation = "destination-in";
        layerCtx.fillStyle = mask;
        layerCtx.fillRect(0, 0, placement.width, placement.height);
    }

    ctx.drawImage(layer, placement.left, placement.top);
}

function createCanvas(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

// Browsers that cannot encode WebP (older Safari) return a PNG; the blob's type says which.
function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) =>
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image"))),
            "image/webp",
            quality,
        ),
    );
}
