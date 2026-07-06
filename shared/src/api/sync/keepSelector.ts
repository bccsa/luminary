import type { Uuid } from "../../types";
import type { MangoSelector } from "../../util/MangoQuery/MangoTypes";

/**
 * Set-based, order-irrelevant language keep for Content documents. Keep a content doc iff its
 * `language` is in `langs`, OR (fallback) none of `langs` has a published translation of the doc —
 * so the doc's own (non-`langs`) translation is the last-resort fallback.
 *
 * This is the *set* a caller must hold to later pick the best available translation locally (the
 * ordered priority pick is a display concern, not a keep concern — order is irrelevant here). Used
 * by both the sync backfill and the live keep gate so the two agree on what a client persists.
 *
 * Returns just the `$or` clause; the caller ANDs it into its own base selector. `langs` must be
 * non-empty: both callers (isSyncable, syncBatch) handle the empty case themselves (match-nothing)
 * before calling, so this builds the keep unconditionally.
 */
export function contentLanguageKeepSelector(langs: readonly Uuid[]): MangoSelector {
    return {
        $or: [
            { language: { $in: [...langs] } },
            {
                $and: langs.map((l) => ({
                    $not: { availableTranslations: { $elemMatch: { $eq: l } } },
                })),
            },
        ],
    } as MangoSelector;
}
