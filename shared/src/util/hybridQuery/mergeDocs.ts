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
 */
export function applySortLimit<T>(docs: T[], sort?: MangoQuery["$sort"], limit?: number): T[] {
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
            if (av == null && bv == null) return 0;
            if (av == null) return -1;
            if (bv == null) return 1;
            if (av < bv) return -1;
            if (av > bv) return 1;
            return 0;
        });
        if (desc) result.reverse();
    }

    if (typeof limit === "number") {
        result = result.slice(0, Math.max(0, limit));
    }

    return result;
}
