import type { ContentDto } from "luminary-shared";
import { thumbHashToAverageRGBA, thumbHashToDataURL } from "thumbhash";

const COVER_TARGET_WIDTH = 640;

/**
 * The picture for the square cover of the full-screen sound screen: the image set nearest square, at the file
 * nearest 640 px wide. Undefined when the post has no image or the bucket's address is not known yet.
 */
export function coverImageUrl(content: ContentDto, bucketBaseUrl?: string): string | undefined {
    const collections = content.parentImageData?.fileCollections ?? [];
    if (!bucketBaseUrl || !collections.length) return undefined;

    const collection = collections.reduce((closest, candidate) =>
        Math.abs(candidate.aspectRatio - 1) < Math.abs(closest.aspectRatio - 1)
            ? candidate
            : closest,
    );
    const files = collection.imageFiles ?? [];
    if (!files.length) return undefined;

    const file = files.reduce((closest, candidate) =>
        Math.abs(candidate.width - COVER_TARGET_WIDTH) <
        Math.abs(closest.width - COVER_TARGET_WIDTH)
            ? candidate
            : closest,
    );
    return `${bucketBaseUrl.replace(/\/$/, "")}/${file.filename}`;
}

/**
 * The post image's ThumbHash as a small picture, for the now-playing screen's colour: stretched over the screen it
 * is already soft, so nothing has to blur it, and it is there before any image has downloaded. From the image set
 * nearest square, as the cover; undefined when the post has none, or it does not decode.
 */
export function thumbHashWash(content: ContentDto | undefined): string | undefined {
    const bytes = thumbHashBytes(content);
    if (!bytes) return undefined;
    try {
        return thumbHashToDataURL(bytes);
    } catch {
        return undefined;
    }
}

/**
 * Highest relative luminance the tint may keep: white text over it then stands at about 6:1, so the bar's
 * dimmer second line still passes 4.5:1.
 */
const TINT_MAX_LUMINANCE = 0.12;

/**
 * The post image's average colour as a solid fill for the minimised bar: one flat colour, so nothing has to be
 * blurred or redrawn, darkened until white text on it reads. Undefined when the post has no ThumbHash.
 */
export function thumbHashTint(content: ContentDto | undefined): string | undefined {
    const bytes = thumbHashBytes(content);
    if (!bytes) return undefined;
    let average: { r: number; g: number; b: number };
    try {
        average = thumbHashToAverageRGBA(bytes);
    } catch {
        return undefined;
    }
    let scale = 1;
    while (scale > 0 && luminance(average, scale) > TINT_MAX_LUMINANCE) scale -= 0.05;
    const channel = (value: number) =>
        Math.round(Math.max(0, Math.min(1, value * Math.max(scale, 0))) * 255);
    return `rgb(${channel(average.r)}, ${channel(average.g)}, ${channel(average.b)})`;
}

/** WCAG relative luminance of a colour whose sRGB channels are scaled by `scale`. */
function luminance({ r, g, b }: { r: number; g: number; b: number }, scale: number): number {
    const linear = (value: number) => {
        const v = Math.max(0, Math.min(1, value * scale));
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The ThumbHash of the image set nearest square, as the cover's, decoded from base64. */
function thumbHashBytes(content: ContentDto | undefined): Uint8Array | undefined {
    const collections = (content?.parentImageData?.fileCollections ?? []).filter(
        (c) => c.thumbHash,
    );
    if (!collections.length) return undefined;
    const collection = collections.reduce((closest, candidate) =>
        Math.abs(candidate.aspectRatio - 1) < Math.abs(closest.aspectRatio - 1)
            ? candidate
            : closest,
    );
    try {
        return Uint8Array.from(atob(collection.thumbHash!), (char) => char.charCodeAt(0));
    } catch {
        return undefined;
    }
}
