import { getIndexNameRegistry } from "../../db/indexNameRegistry";

export type ValidationResult = {
    valid: boolean;
    error: string;
};

export type ValidateQueryOptions = {
    /** Maximum allowed `limit` (rejected above this). Defaults to DEFAULT_MAX_LIMIT. */
    maxLimit?: number;
    /** Override the set of pinnable index names (used by tests). Defaults to the registry. */
    indexNames?: ReadonlySet<string>;
};

/** Fallback cap when the caller doesn't supply one (mirrors the API config default). */
export const DEFAULT_MAX_LIMIT = 500;

/**
 * DoS guards on the selector shape. A pathological selector (deeply nested logical
 * operators, or thousands of clauses) costs CPU to validate and to plan in CouchDB
 * without ever surfacing data the caller couldn't see. These caps are well above any
 * legitimate query (the deepest real shape — the hybrid language-priority selector —
 * nests ~8 levels and has a handful of clauses).
 */
export const MAX_SELECTOR_DEPTH = 12;
export const MAX_SELECTOR_CLAUSES = 256;

const LOGICAL_OPERATORS = new Set(["$and", "$or", "$nor", "$not"]);

/**
 * Array fields on which `$elemMatch` is permitted:
 *  - `memberOf` — group permission filter (injected server-side).
 *  - `availableTranslations` — language-priority filtering in hybrid queries.
 *  - `parentTags` — content-by-category filters (e.g. homepage pinned categories).
 *  - `tags` — a document's own tag-membership filters.
 *
 * `$elemMatch` on any other field is rejected as a data-mining vector. These four are
 * safe because `/query` results are always permission-filtered server-side
 * (query.service.ts injects the `memberOf` filter), so an array-membership test can
 * never surface a document the caller couldn't already see.
 */
const ELEM_MATCH_ALLOWED_FIELDS = new Set([
    "memberOf",
    "availableTranslations",
    "parentTags",
    "tags",
]);

/**
 * Top-level keys a `/query` body may carry. `identifier` is an observability label
 * only (expensive-query logging / rate-limit context) — its value is NOT validated
 * against a known set, but the key MUST be accepted: every deployed client sends it.
 */
const ALLOWED_TOP_LEVEL_KEYS = new Set([
    "identifier",
    "selector",
    "limit",
    "sort",
    "use_index",
    "cms",
    "includeExpired",
]);

/**
 * Validate a `/query` request body against a single universal ruleset (the previous
 * per-identifier template machinery — dynamic require()/eval — has been removed).
 *
 * This is NOT the data-leakage boundary: permission + published/expiry filtering is
 * always injected downstream in query.service.ts, so an arbitrary-but-shape-valid
 * selector can only ever narrow a permission-scoped result. This function enforces:
 *  - a top-level key allowlist (rejects unknown keys),
 *  - a `limit` cap (DoS guard against materializing huge result sets),
 *  - `use_index` membership in the design-doc registry (no steering CouchDB onto
 *    unintended / non-existent indexes),
 *  - an operator policy (no `$regex` / `$where`; `$elemMatch` only on array fields),
 *  - selector depth / clause-count caps.
 *
 * Never mutates the input query.
 */
export function validateQuery(query: any, options: ValidateQueryOptions = {}): ValidationResult {
    const { maxLimit = DEFAULT_MAX_LIMIT, indexNames = getIndexNameRegistry() } = options;

    if (query === null || typeof query !== "object" || Array.isArray(query)) {
        return fail("query must be an object");
    }

    // Top-level key allowlist.
    for (const key of Object.keys(query)) {
        if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) return fail(`Unexpected top-level key '${key}'`);
    }

    // identifier — optional observability label.
    if (query.identifier !== undefined && typeof query.identifier !== "string") {
        return fail("'identifier' must be a string");
    }

    // selector — required, non-array object.
    if (!query.selector || typeof query.selector !== "object" || Array.isArray(query.selector)) {
        return fail("'selector' object is required");
    }

    // limit — optional; when present must be a positive number within the cap.
    if (query.limit !== undefined) {
        if (typeof query.limit !== "number" || query.limit <= 0) {
            return fail("'limit' must be a positive number");
        }
        if (query.limit > maxLimit) {
            return fail(`limit exceeds maximum (${maxLimit})`);
        }
    }

    // sort — optional array.
    if (query.sort !== undefined && !Array.isArray(query.sort)) {
        return fail("'sort' must be an array");
    }

    // cms / includeExpired — optional booleans.
    if (query.cms !== undefined && typeof query.cms !== "boolean") {
        return fail("'cms' must be a boolean");
    }
    if (query.includeExpired !== undefined && typeof query.includeExpired !== "boolean") {
        return fail("'includeExpired' must be a boolean");
    }

    // use_index — optional; must be a known Mango index name.
    if (query.use_index !== undefined) {
        if (typeof query.use_index !== "string") return fail("'use_index' must be a string");
        if (!indexNames.has(query.use_index)) return fail(`Unknown index '${query.use_index}'`);
    }

    // Single recursive walk of the selector: operator policy + DoS guards.
    const walkError = walkSelector(query.selector);
    if (walkError) return fail(walkError);

    return { valid: true, error: "" };
}

function fail(error: string): ValidationResult {
    return { valid: false, error };
}

/**
 * Recursively walk the selector enforcing the operator policy and the depth /
 * clause-count caps in a single traversal. `owningField` is the nearest enclosing
 * document field name (not a logical/comparison operator), so `$elemMatch` can be
 * allowed only when it sits directly under an allowed array field. Returns an error
 * string on the first violation, or null when the selector is clean.
 */
function walkSelector(selector: any): string | null {
    let clauseCount = 0;

    function walk(node: any, owningField: string | undefined, depth: number): string | null {
        if (node === null || typeof node !== "object") return null;
        if (depth > MAX_SELECTOR_DEPTH) {
            return `selector nesting exceeds maximum depth (${MAX_SELECTOR_DEPTH})`;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                const err = walk(item, owningField, depth + 1);
                if (err) return err;
            }
            return null;
        }

        for (const key of Object.keys(node)) {
            // Count object keys only — scalars inside `$in` arrays don't inflate this.
            clauseCount++;
            if (clauseCount > MAX_SELECTOR_CLAUSES) {
                return `selector has too many clauses (max ${MAX_SELECTOR_CLAUSES})`;
            }

            if (key === "$regex") return "operator '$regex' is not allowed";
            if (key === "$where") return "operator '$where' is not allowed";
            if (key === "$elemMatch" && !ELEM_MATCH_ALLOWED_FIELDS.has(owningField ?? "")) {
                // Build the message from the allowlist so it can't drift out of sync.
                const allowed = [...ELEM_MATCH_ALLOWED_FIELDS].map((f) => `'${f}'`).join(", ");
                return `operator '$elemMatch' is only allowed on the ${allowed} fields`;
            }

            // Logical operators ($and/$or/$nor/$not) and comparison operators ($in, $gte, …)
            // don't introduce a new owning field; a plain field key does.
            const nextOwningField =
                LOGICAL_OPERATORS.has(key) || key.startsWith("$") ? owningField : key;

            const err = walk(node[key], nextOwningField, depth + 1);
            if (err) return err;
        }

        return null;
    }

    return walk(selector, undefined, 0);
}

export default validateQuery;
