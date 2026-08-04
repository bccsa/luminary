import type { ContentDto, MangoSelector } from "luminary-shared";

/**
 * Dependency-key vocabulary for incremental (ISR) rebuilds — derived GENERICALLY
 * from a query's selector / a doc's fields, so adding a page or a facet needs no
 * per-page key wiring. The deploy repo carries its own copy for the watcher side;
 * keep the two in sync when this vocabulary changes. See README.md
 * ("Incremental regeneration") for the full key-kind and field-exclusion rationale.
 *
 * Keep this module PURE: no Vue/Dexie/DOM/import.meta — safe in Node + browser.
 */

export type DependencyKey = string;

/** Localizing fields that produce membership facets (the one place to extend). */
const FACET_FIELDS = ["parentId", "parentTags", "parentPinned"] as const;
type FacetField = (typeof FACET_FIELDS)[number];

/** Identity key: every rendered tile reports it; shared across a post/tag's translations. */
export const docKey = (parentId: string): DependencyKey => `doc:${parentId}`;
/** Membership key: a query/doc's value for one of `FACET_FIELDS`, scoped by language. */
const facetKey = (field: string, value: unknown, lang: string): DependencyKey =>
    `facet:${field}:${value}:${lang}`;

export type DocLike = Pick<
    ContentDto,
    "_id" | "parentId" | "parentTags" | "parentPinned" | "language"
>;

/**
 * Keys a single content doc participates in (watcher side). `lang` defaults to the
 * doc's own language.
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
