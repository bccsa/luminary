import type { MangoSelector } from "./MangoTypes";

/** Mango operators whose value is an array of candidate field values. */
const ARRAY_OPERATORS = new Set(["$in", "$nin", "$all"]);

/**
 * Return a copy of `selector` with `null` / `undefined` removed from every
 * `$in` / `$nin` / `$all` array, at any depth.
 *
 * **Why:** CouchDB's Mango `_find` crashes with an unhandled `function_clause`
 * (HTTP 500) when an `$in` / `$nin` / `$all` array contains `null` — and a JS
 * `undefined` array element serialises to JSON `null`. So a reactive id list that
 * momentarily holds an `undefined` (e.g. an optional `parentId` / `parentTaggedDocs`)
 * yields `{ field: { $in: [null] } }` and takes down the query. Stripping the null
 * is semantically safe: `$in` membership against `null` matches no document
 * (CouchDB rejects it outright), and an emptied `$in` (`[]`) correctly matches
 * nothing — which {@link isProvablyEmpty} then short-circuits before any Dexie read
 * or API POST.
 *
 * Applied once at the {@link HybridQuery} fork (`_rebuild`) so both the local Dexie
 * compile and the remote API forward inherit the clean selector. The server-side
 * guards (`validateQuery` / `executeFindQuery`) backstop every other API caller.
 *
 * Pure and non-mutating: the input is never modified (it may be a reactive query
 * thunk's result). Returns a structurally fresh object graph.
 */
export function sanitizeArrayOperators(selector: MangoSelector): MangoSelector {
    return sanitizeNode(selector) as MangoSelector;
}

function sanitizeNode(node: unknown): unknown {
    if (node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(sanitizeNode);

    const out: Record<string, unknown> = {};
    for (const key of Object.keys(node)) {
        const value = (node as Record<string, unknown>)[key];
        if (ARRAY_OPERATORS.has(key) && Array.isArray(value)) {
            // Drop null/undefined members, then recurse into any survivors (an
            // element could itself be an object carrying nested array operators).
            out[key] = value.filter((v) => v !== null && v !== undefined).map(sanitizeNode);
        } else {
            out[key] = sanitizeNode(value);
        }
    }
    return out;
}
