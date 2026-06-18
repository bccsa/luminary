/** Mango operators whose value is an array of candidate field values. */
const ARRAY_OPERATORS = new Set(["$in", "$nin", "$all"]);

/**
 * Last-resort guard on the single path that reaches `nano.db.find`
 * ({@link DbService.executeFindQuery}): a `null` (or `undefined`) member of an
 * `$in` / `$nin` / `$all` array makes CouchDB's `_find` fail with an unhandled
 * `function_clause` (HTTP 500). Throw a clear, observable error instead.
 *
 * The normal `/query` path is already rejected with a 400 by `validateQuery`; this
 * covers the cases that bypass it — `BYPASS_TEMPLATE_VALIDATION=true`, and the
 * internal `search` / sync / `loadLanguages` callers that build selectors directly.
 *
 * Pure; never mutates the query.
 */
export function assertNoNullInArrayOperators(query: { selector?: unknown }): void {
    const offending = findNullArrayOperator(query?.selector);
    if (offending) {
        throw new Error(
            `Mango '${offending}' array must not contain null — it crashes CouchDB (_find function_clause)`,
        );
    }
}

function findNullArrayOperator(node: unknown): string | null {
    if (node === null || typeof node !== "object") return null;

    if (Array.isArray(node)) {
        for (const item of node) {
            const hit = findNullArrayOperator(item);
            if (hit) return hit;
        }
        return null;
    }

    for (const key of Object.keys(node)) {
        const value = (node as Record<string, unknown>)[key];
        if (
            ARRAY_OPERATORS.has(key) &&
            Array.isArray(value) &&
            value.some((v) => v === null || v === undefined)
        ) {
            return key;
        }
        const hit = findNullArrayOperator(value);
        if (hit) return hit;
    }
    return null;
}
