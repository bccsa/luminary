import { getIndexNameRegistry } from "../../db/indexNameRegistry";

export type ValidationResult = {
    valid: boolean;
    error: string;
};

export type ValidateQueryOptions = {
    /** Maximum allowed `limit` (rejected above this). Defaults to DEFAULT_MAX_LIMIT. */
    maxLimit?: number;
    /**
     * Maximum number of distinct languages a NON-CMS query may reference (via `language` field
     * constraints). Rejected above this. CMS queries (`cms: true`) are exempt — they sync all
     * available languages. Defaults to DEFAULT_MAX_LANGUAGES.
     */
    maxLanguages?: number;
    /** Override the set of pinnable index names (used by tests). Defaults to the registry. */
    indexNames?: ReadonlySet<string>;
};

/** Fallback cap when the caller doesn't supply one (mirrors the API config default). */
export const DEFAULT_MAX_LIMIT = 500;

/**
 * Fallback language cap when the caller doesn't supply one. The app lets a user pick at most 3
 * preferred languages, with the default (English) auto-appended for display — so a legitimate
 * non-CMS content query references at most 4 distinct languages (sync keep ≤3; display ≤4). Keep
 * this in step with the client's preferred-language cap (cap + 1 for the auto-appended default).
 */
export const DEFAULT_MAX_LANGUAGES = 4;

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

/** Operators whose value is an array of candidate field values (checked for null members). */
const ARRAY_OPERATORS = new Set(["$in", "$nin", "$all"]);

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
 *  - an operator policy (no `$regex` / `$where`; `$elemMatch` only on array fields;
 *    no `null` member in an `$in` / `$nin` / `$all` array — it crashes CouchDB's
 *    `_find` with an unhandled `function_clause`),
 *  - selector depth / clause-count caps,
 *  - a per-request language cap for NON-CMS queries (guards query cost; CMS is exempt as it
 *    syncs all languages). Enforced here, before query.service injects the permission-language
 *    filter, so it caps the client-requested set — not the (possibly larger) permission set.
 *
 * Never mutates the input query.
 */
export function validateQuery(query: any, options: ValidateQueryOptions = {}): ValidationResult {
    const {
        maxLimit = DEFAULT_MAX_LIMIT,
        maxLanguages = DEFAULT_MAX_LANGUAGES,
        indexNames = getIndexNameRegistry(),
    } = options;

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

    // Single recursive walk of the selector: operator policy + DoS guards + language collection.
    const { error: walkError, languages } = walkSelector(query.selector);
    if (walkError) return fail(walkError);

    // Language cap — NON-CMS only. A content query names its languages via `language` field
    // constraints; non-content queries name none (size 0), so this only ever bites content. CMS
    // (`cms: true`) is exempt: it legitimately syncs every available language.
    if (query.cms !== true && languages.size > maxLanguages) {
        return fail(`query references too many languages (max ${maxLanguages})`);
    }

    return { valid: true, error: "" };
}

function fail(error: string): ValidationResult {
    return { valid: false, error };
}

/**
 * Recursively walk the selector enforcing the operator policy and the depth /
 * clause-count caps in a single traversal. `owningField` is the nearest enclosing
 * document field name (not a logical/comparison operator), so `$elemMatch` can be
 * allowed only when it sits directly under an allowed array field. Also collects the
 * distinct language ids referenced by `language` field constraints (equality, `$eq`, or
 * `$in` members) for the language cap. Returns the first error (or null when clean) plus
 * the collected language set.
 */
function walkSelector(selector: any): { error: string | null; languages: Set<string> } {
    let clauseCount = 0;
    const languages = new Set<string>();

    function walk(node: any, owningField: string | undefined, depth: number): string | null {
        if (node === null || typeof node !== "object") {
            // Leaf: a string directly under the `language` field is a referenced language id
            // (covers `{language: x}`, `{language: {$eq: x}}`, and each `{language: {$in: […]}}`
            // member — all arrive here as string leaves whose nearest owning field is `language`).
            if (typeof node === "string" && owningField === "language") languages.add(node);
            return null;
        }
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
            // A null/undefined member of $in/$nin/$all crashes CouchDB's _find with an
            // unhandled function_clause (HTTP 500). Reject it as a 400 instead.
            if (ARRAY_OPERATORS.has(key) && Array.isArray(node[key])) {
                if (node[key].some((v: unknown) => v === null || v === undefined)) {
                    return `operator '${key}' array must not contain null`;
                }
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

    const error = walk(selector, undefined, 0);
    return { error, languages };
}

export default validateQuery;
