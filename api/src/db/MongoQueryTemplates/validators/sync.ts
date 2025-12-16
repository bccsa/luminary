// Validation template for general sync queries
// Handles all sync query types including:
// - Basic document sync (Post, Tag, Group, User, Redirect, Language, Storage)
// - Content document sync (with parentType and language fields)
// - DeleteCmd document sync (with docType field)

export default (query: any): boolean => {
    // Validate top-level structure
    if (!query.selector || typeof query.selector !== "object") return false;
    if (typeof query.limit !== "number" || query.limit <= 0) return false;
    if (!Array.isArray(query.sort) || query.sort.length !== 1) return false;
    if (!query.sort[0].updatedTimeUtc || query.sort[0].updatedTimeUtc !== "desc") return false;
    if (
        typeof query.use_index !== "string" ||
        !query.use_index.startsWith("sync-") ||
        !query.use_index.endsWith("-index")
    )
        return false;

    // Validate selector
    const selector = query.selector;
    if (!selector.updatedTimeUtc || typeof selector.updatedTimeUtc !== "object") return false;
    if (typeof selector.updatedTimeUtc.$lte !== "number") return false;
    if (typeof selector.updatedTimeUtc.$gte !== "number") return false;
    if (typeof selector.type !== "string") return false;
    // Disallow syncing User documents
    if (selector.type === "user") return false;
    if (!selector.memberOf || typeof selector.memberOf !== "object") return false;
    if (!selector.memberOf.$elemMatch || typeof selector.memberOf.$elemMatch !== "object")
        return false;
    if (!Array.isArray(selector.memberOf.$elemMatch.$in)) return false;
    if (!selector.memberOf.$elemMatch.$in.every((v) => typeof v === "string")) return false;

    // Optional fields in selector - validate if present
    if (selector.parentType !== undefined && typeof selector.parentType !== "string") return false;
    if (
        selector.language !== undefined &&
        (typeof selector.language !== "object" ||
            !Array.isArray(selector.language.$in) ||
            !selector.language.$in.every((v) => typeof v === "string"))
    )
        return false;
    if (selector.docType !== undefined && typeof selector.docType !== "string") return false;

    // Check for extra keys in selector
    const allowedSelectorKeys = [
        "updatedTimeUtc",
        "type",
        "memberOf",
        "parentType",
        "language",
        "docType",
    ];
    const actualSelectorKeys = Object.keys(selector);
    for (const key of actualSelectorKeys) {
        if (!allowedSelectorKeys.includes(key)) return false;
    }

    // Optional top-level fields
    if (query.cms !== undefined && typeof query.cms !== "boolean") return false;

    // Check for extra top-level keys
    const allowedTopLevelKeys = ["selector", "limit", "sort", "use_index", "cms"];
    const actualTopLevelKeys = Object.keys(query);
    for (const key of actualTopLevelKeys) {
        if (!allowedTopLevelKeys.includes(key)) return false;
    }

    return true;
};
