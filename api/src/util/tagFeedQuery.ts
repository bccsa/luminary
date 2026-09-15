import { MongoQueryDto } from "../dto/MongoQueryDto";
import { MongoSelectorDto } from "../dto/MongoSelectorDto";
import { Uuid } from "../enums";

/** Result cap assumed when a tag-feed query arrives without an explicit `limit`. */
export const TAG_FEED_DEFAULT_LIMIT = 50;

/**
 * The index a tag feed is pinned to. `publishDate` leads it, so it serves the sort while
 * `parentTags` is applied as a residual filter — the only arrangement CouchDB will accept
 * (an index led by the `parentTags` array cannot serve a `publishDate` sort at all).
 */
export const TAG_FEED_INDEX = "content-publishDate-index";

/** A `parentTags` feed detected on an incoming query. */
export type TagFeedPlan = {
    tagIds: Uuid[];
    limit: number;
};

/** True when `sort` is a single-field sort on `publishDate`. */
function isPublishDateSort(sort: MongoQueryDto["sort"]): boolean {
    if (!Array.isArray(sort) || sort.length !== 1) return false;
    const keys = Object.keys(sort[0] || {});
    return keys.length === 1 && keys[0] === "publishDate";
}

/**
 * Read tag ids from a `parentTags: { $elemMatch: … }` condition, supporting both the
 * `$in` (several tags) and `$eq` (one tag) forms.
 */
function readTagIds(condition: MongoSelectorDto): Uuid[] | undefined {
    const elem = (condition as Record<string, any>)?.parentTags?.$elemMatch;
    if (!elem || typeof elem !== "object") return undefined;
    if (Array.isArray(elem.$in)) {
        return elem.$in.every((id: unknown) => typeof id === "string") ? elem.$in : undefined;
    }
    if (typeof elem.$eq === "string") return [elem.$eq];
    return undefined;
}

/**
 * Decide whether a query is a tag feed the `content-tag-publishDate` view can bound.
 *
 * Returns `undefined` for anything else, leaving the normal Mango path untouched. The
 * caller must have already established this is a non-CMS Content query — the view indexes
 * published documents only, so it cannot bound a CMS request that expects drafts.
 */
export function planTagFeed(query: MongoQueryDto): TagFeedPlan | undefined {
    if (!isPublishDateSort(query.sort)) return undefined;

    const conditions = query.selector?.$and;
    if (!Array.isArray(conditions)) return undefined;

    let tagIds: Uuid[] | undefined;
    for (const condition of conditions) {
        const found = readTagIds(condition);
        if (!found) continue;
        // Two independent parentTags conditions AND together; one floor can't express that
        // safely, so leave it to plain Mango.
        if (tagIds) return undefined;
        tagIds = found;
    }
    if (!tagIds?.length) return undefined;

    const limit =
        typeof query.limit === "number" && query.limit > 0 ? query.limit : TAG_FEED_DEFAULT_LIMIT;
    return { tagIds, limit };
}

/**
 * The oldest `publishDate` that can still appear in the feed's first `limit` results.
 *
 * Candidates hold each tag's newest `limit` entries, so any document in the union's top
 * `limit` is present here; the `limit`-th newest is therefore a floor no result can fall
 * below. Fewer candidates than `limit` means the tags are exhausted and their oldest entry
 * is the floor.
 */
export function candidateFloor(
    candidates: { publishDate: number }[],
    limit: number,
): number | undefined {
    if (!candidates.length) return undefined;
    const dates = candidates.map((c) => c.publishDate).sort((a, b) => b - a);
    return dates[Math.min(limit, dates.length) - 1];
}

/**
 * Add the view-derived floor to a tag-feed query.
 *
 * Deliberately a LOWER bound only. The floor stops CouchDB walking the publishDate index
 * past the point where results can still exist — the whole saving — while leaving the
 * recent end open, so a document published after the view last indexed is still returned.
 * A stale view can therefore cost a little efficiency but can never hide new content.
 *
 * Every other clause, including all injected permission and visibility filters, is left
 * exactly as built: the floor narrows how far the scan walks, never which documents qualify.
 * `use_index` is forced because only a publishDate-led index can serve this sort.
 */
export function applyTagFeedFloor(query: MongoQueryDto, floor: number): void {
    query.selector.$and.push({ publishDate: { $gte: floor } } as MongoSelectorDto);
    (query as Record<string, any>).use_index = TAG_FEED_INDEX;
}
