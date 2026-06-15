import type { BaseDocumentDto } from "../../types";
import type { MangoQuery } from "../MangoQuery/MangoTypes";

/**
 * Merge two document arrays by `_id`, keeping the copy with the higher
 * `updatedTimeUtc` when the same `_id` appears in both. `a` seeds the result and
 * `b` is merged on top, so when timestamps tie `b` wins (treat `b` as the more
 * authoritative/fresher source, e.g. an API response layered over local docs).
 */
export function mergeById<T extends BaseDocumentDto>(a: readonly T[], b: readonly T[]): T[] {
    const byId = new Map<string, T>();
    for (const doc of a) byId.set(doc._id, doc);
    for (const doc of b) {
        const existing = byId.get(doc._id);
        if (existing === undefined || doc.updatedTimeUtc >= existing.updatedTimeUtc) {
            byId.set(doc._id, doc);
        }
    }
    return Array.from(byId.values());
}

/**
 * Apply a MangoQuery's `$sort` (first entry only, matching `mangoToDexie`) and
 * `$limit` to an in-memory array. Used to re-order/re-truncate a merged result
 * set after combining local + remote docs. Sorts a copy; does not mutate `docs`.
 *
 * Null/undefined sort values sort first (ascending), mirroring the comparator in
 * `mangoToDexie`'s bulkGet path.
 *
 * Ties on the sort field are broken by `_id` (ascending) so the order is **total
 * and source-independent**: the response-cache seed and the live Dexie/API result
 * resolve equal-`publishDate` docs identically, instead of falling back to each
 * source's `mergeById` insertion order (which differs and caused a visible
 * reorder between first paint and the live read). `desc` is folded into the
 * comparator (rather than a trailing `reverse()`) so it flips only the primary
 * key, leaving the `_id` tie-break stable.
 */
export function applySortLimit<T extends BaseDocumentDto>(
    docs: T[],
    sort?: MangoQuery["$sort"],
    limit?: number,
): T[] {
    let result = docs;

    if (sort && sort.length > 0) {
        const entry = sort[0];
        let sortField = "";
        for (const k in entry) {
            sortField = k;
            break;
        }
        const desc = (entry as Record<string, string>)[sortField] === "desc";

        result = result.slice().sort((a, b) => {
            const av = (a as Record<string, unknown>)[sortField] as
                | number
                | string
                | null
                | undefined;
            const bv = (b as Record<string, unknown>)[sortField] as
                | number
                | string
                | null
                | undefined;
            let cmp: number;
            if (av == null && bv == null) cmp = 0;
            else if (av == null) cmp = -1;
            else if (bv == null) cmp = 1;
            else if (av < bv) cmp = -1;
            else if (av > bv) cmp = 1;
            else cmp = 0;
            if (desc) cmp = -cmp;
            if (cmp !== 0) return cmp;
            // Deterministic, source-independent tie-break (always ascending by _id).
            return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
        });
    }

    if (typeof limit === "number") {
        result = result.slice(0, Math.max(0, limit));
    }

    return result;
}

/**
 * True when two windowed result arrays are visually identical — same length, and
 * the same `_id` + `updatedTimeUtc` at every position. `updatedTimeUtc` is the
 * revision clock (any content change bumps it), so equal id + timestamp ⇒ equal
 * doc. Used to skip a `ShallowRef` reassignment when a recompute produced no
 * visible change, saving a Vue re-render.
 */
export function sameWindow<T extends BaseDocumentDto>(
    a: readonly T[],
    b: readonly T[] | undefined,
): boolean {
    if (!b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i]._id !== b[i]._id || a[i].updatedTimeUtc !== b[i].updatedTimeUtc) return false;
    }
    return true;
}
