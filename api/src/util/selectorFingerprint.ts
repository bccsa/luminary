/**
 * Build a structural fingerprint of a Mango query for logging — a readable skeleton
 * with all runtime values stripped, so two queries that differ only in their values
 * (group ids, languages, dates, slugs, …) produce the same fingerprint. This lets the
 * expensive-query logs be grouped by query *shape*, which is what you need to decide
 * whether a missing index is worth adding.
 *
 * Server-local sibling of the client's `structuralCacheKey`
 * (shared/src/util/hybridQuery/responseCache.ts), but unhashed — the readable skeleton
 * is the point here. Computed lazily (only for queries already flagged expensive), so
 * the recursion cost is off the hot path.
 *
 * Normalization rules:
 *  - object keys preserved and sorted (so key order doesn't change the fingerprint),
 *  - operator keys ($and, $in, $gte, …) and field names kept verbatim,
 *  - primitive values collapsed to "·",
 *  - arrays of primitives collapse to ["·"]; arrays of objects keep their structure.
 */
const PLACEHOLDER = "·";
const MAX_LEN = 1024;

export function selectorFingerprint(query: {
    selector?: any;
    sort?: any;
    use_index?: any;
    limit?: number;
}): string {
    const skeleton = {
        selector: normalize(query?.selector),
        sort: normalize(query?.sort),
        use_index: query?.use_index ?? null,
    };
    const str = JSON.stringify(skeleton);
    return str.length > MAX_LEN ? str.slice(0, MAX_LEN) + "…" : str;
}

function normalize(node: any): any {
    if (node === null || node === undefined) return null;

    if (Array.isArray(node)) {
        // Collapse arrays of primitives to a single placeholder element; keep the
        // structure of arrays that contain objects (e.g. $or branches).
        const hasObject = node.some((v) => v !== null && typeof v === "object");
        if (!hasObject) return node.length ? [PLACEHOLDER] : [];
        return node.map(normalize);
    }

    if (typeof node === "object") {
        const out: Record<string, any> = {};
        for (const key of Object.keys(node).sort()) {
            out[key] = normalize(node[key]);
        }
        return out;
    }

    // Primitive value.
    return PLACEHOLDER;
}

export default selectorFingerprint;
