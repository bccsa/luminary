import type { BaseDocumentDto, DocType } from "../../types";
import { syncList } from "../../rest/sync2/state";
import { splitChunkTypeString } from "../../rest/sync2/utils";
import { getContentPublishDateCutoff } from "../../config";
import { expandMangoSelector } from "../MangoQuery/expandMangoQuery";
import type { MangoQuery, MangoSelector } from "../MangoQuery/MangoTypes";

/**
 * Read the query's top-level `type` equality (`{ type: "x" }` or `{ type: { $eq: "x" } }`)
 * from the expanded $and. Returns `undefined` when the query has no top-level type
 * (e.g. missing, `$or` across types, non-equality). `HybridQuery` then treats it as
 * non-content / not-in-syncList and passes it through to the API.
 */
export function readType(query: MangoQuery): DocType | undefined {
    if (!query?.selector || typeof query.selector !== "object") return undefined;
    const conditions = expandMangoSelector(query.selector).$and ?? [];
    for (const cond of conditions) {
        if (cond.$or || cond.$nor || cond.$not || cond.$and) continue;
        if (!("type" in cond)) continue;
        const criteria = (cond as Record<string, unknown>).type;
        if (typeof criteria === "string") return criteria as DocType;
        if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
            const eq = (criteria as Record<string, unknown>).$eq;
            if (typeof eq === "string") return eq as DocType;
        }
    }
    return undefined;
}

/**
 * True iff at least one syncList entry currently tracks the given doc type
 * (regardless of subType / memberOf / language). Used by the non-content branch:
 * synced types are served from Dexie only; not-in-syncList types are fetched from
 * the API only.
 */
export function typeIsInSyncList(type: DocType | undefined): boolean {
    if (type === undefined) return false;
    for (const entry of syncList.value) {
        if (splitChunkTypeString(entry.chunkType).type === type) return true;
    }
    return false;
}

/**
 * Locate a top-level `_id: { $in: [...] }` constraint and return its id list +
 * its position within the expanded `$and`. The caller can then rebuild the
 * selector with a narrowed id list. Returns `undefined` when the query isn't an
 * id-list query.
 */
export function findIdInList(
    conditions: MangoSelector[],
): { index: number; ids: string[] } | undefined {
    for (let i = 0; i < conditions.length; i++) {
        const cond = conditions[i];
        const criteria = (cond as Record<string, unknown>)._id;
        if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) continue;
        const inVal = (criteria as Record<string, unknown>).$in;
        if (!Array.isArray(inVal)) continue;
        const ids = inVal.filter((v): v is string => typeof v === "string");
        return { index: i, ids };
    }
    return undefined;
}

/**
 * Append `publishDate <= cutoff` to a selector as an additional AND clause.
 * Does not remove or modify any existing `publishDate` constraint — an existing
 * `$gte` lower bound is preserved, and an existing `$lte` upper bound intersects
 * with this one (the smaller wins semantically). Always returns a flat
 * `{ $and: [...] }` for predictability.
 */
export function withPublishDate(selector: MangoSelector, cutoff: number): MangoSelector {
    const expanded = expandMangoSelector(selector);
    return { $and: [...(expanded.$and ?? []), { publishDate: { $lte: cutoff } } as MangoSelector] };
}

/**
 * Decide what (if anything) `HybridQuery` should POST to the API after running
 * the local Dexie read. Pure — no Vue / no I/O.
 *
 * Three sub-branches, first match wins (per the routing flowchart):
 *
 * 1. `$limit` present and `localDocs.length === $limit` → local is sufficient
 *    (returns `undefined`). Otherwise POST with `publishDate <= cutoff` and
 *    `$limit = $limit - localDocs.length` (fetch only the shortfall of older docs).
 * 2. Top-level `_id: { $in: [...] }` and every requested id is local → done. Else
 *    POST with `_id ∈ (missing ids)` AND `publishDate <= cutoff`, no sort/limit.
 *    The cutoff clause on an id-list is correct under the core invariant: a
 *    missing id must be older than the cutoff because the newest content is
 *    always local. Do not "fix" this without reading the invariant.
 * 3. Neither $limit nor id-list → always POST the original query with
 *    `publishDate <= cutoff` appended (the open-ended content query always probes
 *    for the older tail).
 *
 * Cutoff comes from `getContentPublishDateCutoff()` (`SharedConfig`), so this
 * function reflects the same global value sync2 uses to floor content sync depth.
 */
export function decideContentApiQuery<T extends BaseDocumentDto>(
    query: MangoQuery,
    localDocs: readonly T[],
): MangoQuery | undefined {
    const cutoff = getContentPublishDateCutoff();

    // 1. limit-shortfall
    if (typeof query.$limit === "number") {
        // `>=` (not strict equality) defends against mangoToDexie ever returning
        // more rows than requested; clamping below also keeps the API limit
        // non-negative if the invariant is ever violated.
        if (localDocs.length >= query.$limit) return undefined;
        return {
            selector: withPublishDate(query.selector, cutoff),
            $sort: query.$sort,
            $limit: Math.max(0, query.$limit - localDocs.length),
            use_index: query.use_index,
        };
    }

    const conditions = expandMangoSelector(query.selector).$and ?? [];

    // 2. id-diff. The narrowed remote query is a pure `_id` lookup, which
    //    CouchDB serves from the built-in `_id` index — don't forward a sort-
    //    oriented use_index here; it'd be wrong for the shape.
    const idHit = findIdInList(conditions);
    if (idHit) {
        if (localDocs.length === idHit.ids.length) return undefined;
        const have = new Set(localDocs.map((d) => d._id));
        const missing = idHit.ids.filter((id) => !have.has(id));
        if (missing.length === 0) return undefined;
        const narrowed = conditions.map((c, i) =>
            i === idHit.index ? ({ _id: { $in: missing } } as MangoSelector) : c,
        );
        return { selector: withPublishDate({ $and: narrowed }, cutoff) };
    }

    // 3. always-post (no limit, no id list)
    return {
        selector: withPublishDate(query.selector, cutoff),
        $sort: query.$sort,
        use_index: query.use_index,
    };
}
