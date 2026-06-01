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
const ALLOWED_USE_INDEX = new Set<string>(["content-publishDate-index"]);

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
