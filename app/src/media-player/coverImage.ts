import type { ContentDto } from "luminary-shared";
import { washAverage, washOf } from "./wash/thumbHashWash";

const COVER_TARGET_WIDTH = 640;

/**
 * The picture for the square cover of the full-screen sound screen: the image set nearest square, at the file
 * nearest 640 px wide. Undefined when the post has no image or the bucket's address is not known yet.
 */
export function coverImageUrl(content: ContentDto, bucketBaseUrl?: string): string | undefined {
    return imageUrlNear(content, bucketBaseUrl, 1, COVER_TARGET_WIDTH);
}

/**
 * Every width of the cover's image set, as `srcset`: as `LImage` offers its pictures, so the browser can settle on a
 * width it already holds when the network is away. Undefined when the post has no image or the bucket is not known.
 */
export function coverImageSrcset(content: ContentDto, bucketBaseUrl?: string): string | undefined {
    const collection = collectionNear(content, 1);
    if (!bucketBaseUrl || !collection?.imageFiles?.length) return undefined;
    const base = bucketBaseUrl.replace(/\/$/, "");
    return [...collection.imageFiles]
        .sort((a, b) => a.width - b.width)
        .map((file) => `${base}/${file.filename} ${file.width}w`)
        .join(", ");
}

/**
 * Every file of the post's image, as addresses: the ones of at least `minWidth` from the smallest up, then the smaller
 * ones from the largest down. Whatever the page has drawn of the post is among them.
 */
export function imageFileUrls(
    content: ContentDto,
    bucketBaseUrl: string | undefined,
    minWidth: number,
): string[] {
    if (!bucketBaseUrl) return [];
    const base = bucketBaseUrl.replace(/\/$/, "");
    const files = (content.parentImageData?.fileCollections ?? []).flatMap(
        (collection) => collection.imageFiles ?? [],
    );
    const large = files.filter((f) => f.width >= minWidth).sort((a, b) => a.width - b.width);
    const small = files.filter((f) => f.width < minWidth).sort((a, b) => b.width - a.width);
    return [...large, ...small].map((file) => `${base}/${file.filename}`);
}

function collectionNear(content: ContentDto, aspect: number) {
    const collections = content.parentImageData?.fileCollections ?? [];
    if (!collections.length) return undefined;
    return collections.reduce((closest, candidate) =>
        Math.abs(candidate.aspectRatio - aspect) < Math.abs(closest.aspectRatio - aspect)
            ? candidate
            : closest,
    );
}

const POSTER_ASPECT = 16 / 9;
const POSTER_TARGET_WIDTH = 960;

/**
 * The post's wide picture, as the player's poster shows it: the image set nearest 16:9, at the file nearest
 * 960 px wide. Undefined when the post has no image or the bucket's address is not known yet.
 */
export function posterImageUrl(content: ContentDto, bucketBaseUrl?: string): string | undefined {
    return imageUrlNear(content, bucketBaseUrl, POSTER_ASPECT, POSTER_TARGET_WIDTH);
}

function imageUrlNear(
    content: ContentDto,
    bucketBaseUrl: string | undefined,
    aspect: number,
    width: number,
): string | undefined {
    const collections = content.parentImageData?.fileCollections ?? [];
    if (!bucketBaseUrl || !collections.length) return undefined;

    const collection = collections.reduce((closest, candidate) =>
        Math.abs(candidate.aspectRatio - aspect) < Math.abs(closest.aspectRatio - aspect)
            ? candidate
            : closest,
    );
    const files = collection.imageFiles ?? [];
    if (!files.length) return undefined;

    const file = files.reduce((closest, candidate) =>
        Math.abs(candidate.width - width) < Math.abs(closest.width - width) ? candidate : closest,
    );
    return `${bucketBaseUrl.replace(/\/$/, "")}/${file.filename}`;
}

/**
 * The post image's ThumbHash (base64), from the image set nearest square, as the cover: the now-playing screen and the
 * bar are drawn from it (see `wash/thumbHashWash.ts`). Undefined when the post has none, or it does not decode.
 */
export function thumbHashOf(content: ContentDto | undefined): string | undefined {
    const bytes = thumbHashBytes(content);
    if (!bytes || !washOf(bytes)) return undefined;
    return btoa(String.fromCharCode(...bytes));
}

/** The wash's average colour, a flat fill for where the wash is not drawn (the strip under the bar). */
export function thumbHashTint(content: ContentDto | undefined): string | undefined {
    const bytes = thumbHashBytes(content);
    const wash = bytes && washOf(bytes);
    if (!wash) return undefined;
    const [r, g, b] = washAverage(wash).map((value) => Math.round(value * 255));
    return `rgb(${r}, ${g}, ${b})`;
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
