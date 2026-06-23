import type { BaseDocumentDto } from "../../types";
import { DocType } from "../../types";
import { syncList } from "../../api/sync/state";
import { splitChunkTypeString, OPEN_MIN } from "../../api/sync/utils";
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
 * Locate a top-level `<field>: { $in: [...] }` constraint and return its (string)
 * value list + its position within the expanded `$and`. Shared by the id-diff and
 * fan-out paths.
 */
function findInList(
    conditions: MangoSelector[],
    field: string,
): { index: number; ids: string[] } | undefined {
    for (let i = 0; i < conditions.length; i++) {
        const criteria = (conditions[i] as Record<string, unknown>)[field];
        if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) continue;
        const inVal = (criteria as Record<string, unknown>).$in;
        if (!Array.isArray(inVal)) continue;
        const ids = inVal.filter((v): v is string => typeof v === "string");
        return { index: i, ids };
    }
    return undefined;
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
    return findInList(conditions, "_id");
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
 * function reflects the same global value sync uses to floor content sync depth.
 */
export function decideContentApiQuery<T extends BaseDocumentDto>(
    query: MangoQuery,
    localDocs: readonly T[],
): MangoQuery | undefined {
    const cutoff = getContentPublishDateCutoff();

    // No cutoff configured ⇒ sync syncs all content, so the local read is
    // complete and the API has no older tail to supply. The supplement POST
    // would carry `publishDate <= OPEN_MIN` and match nothing — skip it. The
    // caller then drops any stale response-cache seed (same end state as an
    // empty POST) and, in live mode, skips the no-op supplement listener.
    if (cutoff === OPEN_MIN) return undefined;

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

/**
 * Cap on parents to fan out. Beyond this, a burst of N concurrent POSTs (e.g. a
 * large bookmark list) costs more than one scan query, so we fall back to a single
 * query rather than flooding the API.
 */
export const FANOUT_MAX_PARENTS = 25;

const PARENT_ID_INDEX = "content-parentId-publishDate-index";

/** Default sort synthesized for a fan-out clone that had none — see {@link fanOut}. */
const PUBLISH_DATE_DESC = [{ publishDate: "desc" }] as MangoQuery["$sort"];

/**
 * Per-value fan-out core. Given a located `{ index, ids }` hit on `conditions`, dedups +
 * range-checks the ids and clones the selector once per id, replacing the matched
 * condition via `rewrite(id)` and pinning `use_index = indexName`. Returns `undefined`
 * (so the caller can fall through to `[api]`) when the hit doesn't qualify — 0 ids (a
 * provably-empty `$in`) or more than {@link FANOUT_MAX_PARENTS}.
 *
 * Each clone carries `$sort`/`$limit` unchanged, EXCEPT a query with no `$sort` gets a
 * synthesized `publishDate desc` so the `[parentId, publishDate]` index reliably engages
 * (a scalar equality + a `publishDate` sort is what makes it seek instead of scan — the
 * same pattern the parentPinned feeds already rely on). This is display-safe:
 * `HybridQuery` re-applies the ORIGINAL query's sort+limit to the merged local+remote
 * window via {@link applySortLimit}, so a per-clone sort only governs which docs are
 * fetched under a limit, never final order.
 */
function fanOut(
    api: MangoQuery,
    conditions: MangoSelector[],
    hit: { index: number; ids: string[] },
    indexName: string,
    rewrite: (id: string) => MangoSelector,
): MangoQuery[] | undefined {
    // Dedup so a repeated value (e.g. an un-deduped tagged-docs list) never fires a
    // redundant POST. Output is unaffected — mergeById would collapse it anyway.
    const uniqueIds = Array.from(new Set(hit.ids));
    if (uniqueIds.length < 1 || uniqueIds.length > FANOUT_MAX_PARENTS) return undefined;

    const $sort = api.$sort ?? PUBLISH_DATE_DESC;
    return uniqueIds.map((id) => {
        const narrowed = conditions.map((c, i) => (i === hit.index ? rewrite(id) : c));
        return { ...api, selector: { $and: narrowed }, $sort, use_index: indexName };
    });
}

/**
 * Fan a multi-parent Content supplement into per-parent queries so each can SEEK
 * `content-parentId-publishDate-index` (parentId equality + publishDate) instead of
 * forcing one publishDate-window scan — CouchDB can't combine an `$in`-on-parentId with
 * a global `publishDate` sort, so the single query degrades to a full scan of the window.
 *
 * Returns one query per id when `api` is a Content query with a top-level
 * `parentId: { $in: [...] }` of 1..{@link FANOUT_MAX_PARENTS} ids: each clone replaces
 * the `$in` with a `parentId` equality and repoints `use_index` to the parentId index,
 * carrying `$sort`/`$limit` (synthesizing `publishDate desc` when absent — see
 * {@link fanOut}). The per-parent over-fetch is corrected when `HybridQuery` re-applies
 * sort+limit to the merged result via {@link applySortLimit}. Returns `[api]` unchanged
 * otherwise — non-Content, no `$in`, an empty `$in`, or more than
 * {@link FANOUT_MAX_PARENTS} (the full-scan fallback avoids a request storm).
 *
 * NOTE: there is intentionally no `parentTags` fan-out. A `parentTags $elemMatch:$in`
 * targets a multikey (array) index, and CouchDB cannot serve a `publishDate` sort from a
 * multikey index even for a single-value `$elemMatch` ("No index exists for this sort").
 * Tag-filtered feeds therefore keep their `content-publishDate-index` scan; see the
 * call-site comments in HomePagePinned / PinnedTopics / PinnedVideo.
 *
 * Pure. Runs AFTER {@link decideContentApiQuery} (which decides whether/what to POST);
 * this decides how many. The content gate keeps a non-Content query from being repointed
 * at the content-only parentId index.
 */
export function planRemoteContentQueries(api: MangoQuery): MangoQuery[] {
    if (!api?.selector || typeof api.selector !== "object") return [api];
    if (readType(api) !== DocType.Content) return [api];

    const conditions = expandMangoSelector(api.selector).$and ?? [];
    const idHit = findInList(conditions, "parentId");
    if (!idHit) return [api];

    return (
        fanOut(api, conditions, idHit, PARENT_ID_INDEX, (id) => ({ parentId: id })) ?? [api]
    );
}

/**
 * Build a selector that matches the `DeleteCmd`s for the docs a supplement query
 * targets. A `DeleteCmd` carries the deleted doc's `docType` and `docId` but NOT
 * its content fields (`publishDate`, `parentType`, `language`, …), and
 * `mangoCompile` treats a missing field as non-matching — so the original content
 * selector can't be evaluated against a `DeleteCmd`. We therefore reduce it: map
 * `type → docType` and `_id → docId`, dropping every other clause. The result is
 * effectively a `docType` (+ id-list) pre-filter; `HybridQuery` still gates each
 * delete on `db.validateDeleteCommand` + output membership + the stale guard.
 *
 * `queryType` is the resolved top-level type ({@link readType}) — `undefined` for
 * a typeless / `$or`-across-types query, in which case the selector is `{}`
 * (matches all, leaving membership as the sole gate).
 */
export function toDeleteSelector(
    selector: MangoSelector,
    queryType: DocType | undefined,
): MangoSelector {
    const and: MangoSelector[] = [];
    if (queryType) and.push({ docType: queryType } as MangoSelector);
    const idHit = findIdInList(expandMangoSelector(selector).$and ?? []);
    if (idHit) and.push({ docId: { $in: idHit.ids } } as MangoSelector);
    return and.length ? { $and: and } : {};
}
