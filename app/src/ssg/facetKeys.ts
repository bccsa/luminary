import type { ContentDto, MangoSelector } from "luminary-shared";

/**
 * Phase 2 dependency-key vocabulary — the SINGLE SOURCE OF TRUTH, derived
 * GENERICALLY (no hardcoded per-page keys). Imported by BOTH:
 *  - the build (capture side): `facetsFromSelector` turns a query's selector into
 *    the keys the rendered page depends on, and
 *  - the deploy-repo watcher: `facetsFromDoc` turns a changed doc into the keys it
 *    touches.
 * Because both sides map the SAME whitelisted fields the SAME way, a page goes
 * stale exactly when a changed doc could enter/leave/alter its result set — with
 * no per-page wiring. Rearranging layout or adding a query needs zero key changes;
 * only a new *data facet* touches `FACET_FIELDS` below.
 *
 * Keep this module PURE: no Vue/Dexie/DOM/import.meta — safe in Node + browser.
 *
 * Two key kinds:
 *  - `doc:<parentId>` — identity. Every rendered tile reports it (card-display
 *    edits — title/image/summary — invalidate the listing). All translations of a
 *    post/tag share `parentId`, so this also covers hreflang reciprocity.
 *  - `facet:<field>:<value>:<lang>` — membership. Derived from the localizing
 *    fields a query filters on / a doc carries.
 *
 * Time/published/language-priority fields (publishDate/expiryDate/status/
 * availableTranslations) are deliberately EXCLUDED — scheduled-publish and the
 * translations cascade are handled by a periodic full rebuild, not change events.
 * `parentTagType`/`parentType`/`parentPostType` are excluded to bound fan-out
 * (`parentId`/`parentTags` already pin membership).
 */

export type DependencyKey = string;

/** Localizing fields that produce membership facets (the one place to extend). */
const FACET_FIELDS = ["parentId", "parentTags", "parentPinned"] as const;
type FacetField = (typeof FACET_FIELDS)[number];

export const docKey = (parentId: string): DependencyKey => `doc:${parentId}`;
const facetKey = (field: string, value: unknown, lang: string): DependencyKey =>
    `facet:${field}:${value}:${lang}`;

export type DocLike = Pick<
    ContentDto,
    "_id" | "parentId" | "parentTags" | "parentPinned" | "language"
>;

/**
 * Keys a single content doc participates in (watcher side; also `keysForChangedDoc`).
 * `lang` defaults to the doc's own language.
 */
export function facetsFromDoc(doc: DocLike, lang: string = doc.language ?? ""): DependencyKey[] {
    const keys = new Set<DependencyKey>();
    keys.add(docKey(doc.parentId || doc._id));
    if (doc.parentId) keys.add(facetKey("parentId", doc.parentId, lang));
    for (const t of doc.parentTags ?? []) if (t) keys.add(facetKey("parentTags", t, lang));
    if (doc.parentPinned && doc.parentPinned > 0) keys.add(facetKey("parentPinned", 1, lang));
    return [...keys];
}

/**
 * Membership keys a query depends on (capture side). Walks the selector for the
 * whitelisted fields and emits a facet per concrete value it filters on.
 * Positive constraints only (eq / $eq / $in / parentTags.$elemMatch); negative or
 * range constraints ($ne/$exists/$gt/$lt/…) emit nothing — those are covered by
 * the per-tile `doc:` keys + the periodic full rebuild.
 */
export function facetsFromSelector(selector: MangoSelector, lang: string): DependencyKey[] {
    const keys = new Set<DependencyKey>();
    walk(selector, keys, lang);
    return [...keys];
}

function walk(node: unknown, keys: Set<DependencyKey>, lang: string): void {
    if (!node || typeof node !== "object") return;
    for (const [field, value] of Object.entries(node as Record<string, unknown>)) {
        if (field === "$and" || field === "$or") {
            if (Array.isArray(value)) for (const sub of value) walk(sub, keys, lang);
            continue;
        }
        if (field === "$not") continue; // negative — not a finite key set
        if (!FACET_FIELDS.includes(field as FacetField)) continue;
        for (const v of valuesOf(value)) keys.add(facetKey(field, v, lang));
    }
}

/** Extract the concrete positive values a field is constrained to. */
function valuesOf(constraint: unknown): unknown[] {
    if (constraint === null || typeof constraint !== "object") {
        return constraint === undefined ? [] : [constraint]; // direct equality
    }
    const c = constraint as Record<string, unknown>;
    if ("$eq" in c) return [c.$eq];
    if (Array.isArray(c.$in)) return c.$in;
    if (c.$elemMatch && typeof c.$elemMatch === "object") {
        const em = c.$elemMatch as Record<string, unknown>;
        if ("$eq" in em) return [em.$eq];
        if (Array.isArray(em.$in)) return em.$in;
    }
    return []; // $ne / $exists / ranges → no facet
}

// --- Deployment-side ISR helpers ---

/** Keys a changed doc touches (watcher). Alias of {@link facetsFromDoc}. */
export const keysForChangedDoc = (doc: DocLike): DependencyKey[] => facetsFromDoc(doc);

/** Re-categorization: union of the previous and next doc state (old∪new). */
export function keysForRecategorization(prev: DocLike, next: DocLike): DependencyKey[] {
    return [...new Set([...facetsFromDoc(prev), ...facetsFromDoc(next)])];
}
