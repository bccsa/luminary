// Validation template for hybridQuery requests issued by the shared
// hybridQuery module (shared/src/util/hybridQuery/).
//
// Selectors are intentionally unrestricted: query.service.ts always injects
// permission + memberOf $elemMatch $in viewGroups + language filtering for
// Content, so accepting an arbitrary selector here does not leak data.
//
// This validator only enforces top-level shape:
//   - selector:  object (required)
//   - limit:     positive number (optional)
//   - sort:      array (optional)
//   - cms:       boolean (optional)
//   - use_index: must be a known index name (optional)
// Extra top-level keys are rejected.

// Hard-coded allowlist of index names that hybridQuery callers may pin. Pattern
// matching (e.g. anything starting with `content-`) would let a buggy / malicious
// client steer CouchDB onto unintended indexes. Add entries here when a new
// caller needs one.
//
// The `content-<field>-publishDate-index` entries are per-shape indexes: each
// leads with a selective equality field (parentId / slug / parentPinned /
// parentTagType) then publishDate, so a content query that pins one AND sorts by
// publishDate seeks directly instead of scanning the whole content collection.
// Note: these only engage when the query carries a `publishDate` $sort — without
// it CouchDB falls back to a full scan (see the design-doc JSON in db/designDocs).
const ALLOWED_USE_INDEX = new Set<string>([
    "content-publishDate-index",
    "content-parentId-publishDate-index",
    "content-slug-publishDate-index",
    "content-parentPinned-publishDate-index",
    "content-parentTagType-publishDate-index",
]);

export default (query: any): boolean => {
    if (!query || typeof query !== "object") return false;
    if (!query.selector || typeof query.selector !== "object" || Array.isArray(query.selector))
        return false;

    const allowedTop = ["selector", "limit", "sort", "cms", "use_index"];
    for (const k of Object.keys(query)) {
        if (!allowedTop.includes(k)) return false;
    }

    if (query.limit !== undefined && (typeof query.limit !== "number" || query.limit <= 0))
        return false;
    if (query.sort !== undefined && !Array.isArray(query.sort)) return false;
    if (query.cms !== undefined && typeof query.cms !== "boolean") return false;
    if (
        query.use_index !== undefined &&
        (typeof query.use_index !== "string" || !ALLOWED_USE_INDEX.has(query.use_index))
    )
        return false;

    return true;
};
