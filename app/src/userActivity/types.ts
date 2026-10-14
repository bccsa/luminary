import type { UserActivityEntry } from "luminary-shared";
import type { HighlightRange } from "@/util/highlightRanges";

/**
 * A stored activity with its payload narrowed: the shared table leaves the payload untyped,
 * and only a highlight carries one — the passages it saved, each with its own text.
 */
export type UserActivityDoc = Omit<UserActivityEntry, "payload"> & {
    payload?: { ranges: HighlightRange[] };
};
