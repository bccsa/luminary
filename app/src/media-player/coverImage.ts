import type { ContentDto } from "luminary-shared";

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
