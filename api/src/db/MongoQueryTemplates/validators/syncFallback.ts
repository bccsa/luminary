// Validation template for fallback content sync queries.
//
// This is a one-shot sync used to fetch content documents for parents that the
// main preferred-language sync could not cover (e.g. a post whose only
// translation is in a language outside the user's preferred set). It is
// structurally distinct from the normal sync template:
// - Always targets content documents (type === "content") with a parentType.
// - Selects by an explicit parentId $in list instead of a language $in list.
// - Does NOT carry an updatedTimeUtc range (fetches all matching docs in one go).

export default (query: any): boolean => {
    // Top-level structure
    if (!query.selector || typeof query.selector !== "object") return false;
    if (typeof query.limit !== "number" || query.limit <= 0) return false;
    if (!Array.isArray(query.sort) || query.sort.length !== 1) return false;
    if (!query.sort[0].updatedTimeUtc || query.sort[0].updatedTimeUtc !== "desc") return false;
    if (
        typeof query.use_index !== "string" ||
        !query.use_index.startsWith("sync-") ||
        !query.use_index.endsWith("-content-index")
    )
        return false;

    const selector = query.selector;

    // type must be content
    if (selector.type !== "content") return false;

    // parentType is required and must be a string (post / tag)
    if (typeof selector.parentType !== "string") return false;

    // parentId must be a non-empty $in array of strings
    if (
        !selector.parentId ||
        typeof selector.parentId !== "object" ||
        !Array.isArray(selector.parentId.$in) ||
        selector.parentId.$in.length === 0 ||
        !selector.parentId.$in.every((v: unknown) => typeof v === "string")
    )
        return false;

    // memberOf required — same shape as the normal sync validator
    if (!selector.memberOf || typeof selector.memberOf !== "object") return false;
    if (!selector.memberOf.$elemMatch || typeof selector.memberOf.$elemMatch !== "object")
        return false;
    if (!Array.isArray(selector.memberOf.$elemMatch.$in)) return false;
    if (!selector.memberOf.$elemMatch.$in.every((v: unknown) => typeof v === "string")) return false;

    // Reject any extra selector keys
    const allowedSelectorKeys = ["type", "parentType", "parentId", "memberOf"];
    for (const key of Object.keys(selector)) {
        if (!allowedSelectorKeys.includes(key)) return false;
    }

    // Optional top-level fields
    if (query.cms !== undefined && typeof query.cms !== "boolean") return false;

    // Reject any extra top-level keys
    const allowedTopLevelKeys = ["selector", "limit", "sort", "use_index", "cms"];
    for (const key of Object.keys(query)) {
        if (!allowedTopLevelKeys.includes(key)) return false;
    }

    return true;
};
