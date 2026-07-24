import type { ContentDto } from "luminary-shared";

/** Below this, a tag doesn't have enough siblings to read as a sequence at all. */
export const MIN_SERIES_TAG_SIZE = 2;
/** Above this, a tag reads as a broad topic/category rather than an ordered mini-collection —
 *  there's no dedicated series/order concept in the schema, so tag size is the only proxy
 *  available; keeping this low biases toward not showing a series rather than a wrong one. */
export const MAX_SERIES_TAG_SIZE = 20;

/**
 * Pick the most series-like tag among an article's own tags: the smallest one whose
 * tagged-doc count falls in the plausible range above. Exported for unit testing.
 */
export function selectSeriesTag(tags: ContentDto[]): ContentDto | undefined {
    let best: ContentDto | undefined;
    let bestSize = Infinity;
    for (const tag of tags) {
        const size = (tag.parentTaggedDocs ?? []).filter((id) => id != null).length;
        if (size < MIN_SERIES_TAG_SIZE || size > MAX_SERIES_TAG_SIZE) continue;
        if (size < bestSize) {
            best = tag;
            bestSize = size;
        }
    }
    return best;
}
