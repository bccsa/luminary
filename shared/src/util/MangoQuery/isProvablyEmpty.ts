import type { MangoSelector } from "./MangoTypes";

/**
 * Conservatively decide whether a Mango selector is **unsatisfiable by
 * construction** — i.e. it can return no documents regardless of the data — so a
 * caller can skip the Dexie read / API round-trip entirely.
 *
 * **Sound but intentionally incomplete.** The only signal it uses is an empty
 * `$in` (`{ $in: [] }`) — and an `$elemMatch` whose inner predicate is itself
 * provably empty — sitting in a *conjunctive* position. It never flags a query
 * that could match, so a `false` result means only "not provably empty", not
 * "non-empty". It does **not** attempt to detect contradictions (`{x:1},{x:2}`),
 * `$all: []`, impossible ranges, etc.
 *
 * **Boolean structure is respected.** An empty `$in` only forces the whole query
 * empty when it is ANDed in (top-level, under `$and`, or as an `$elemMatch`
 * requirement). Inside an `$or` it forces empty only if *every* branch does; under
 * `$not` / `$nor` satisfiability inverts, so we bail (return `false`) to stay
 * sound.
 *
 * O(selector size) and called once per query (not per document) — negligible next
 * to the IndexedDB scan or network round-trip it lets the caller avoid.
 */
export function isProvablyEmpty(selector: MangoSelector | undefined | null): boolean {
    if (!selector || typeof selector !== "object" || Array.isArray(selector)) return false;
    return forcesEmpty(selector);
}

/**
 * Does `node`, read as a positive (must-hold) requirement, force the overall match
 * set to be empty?
 */
function forcesEmpty(node: unknown): boolean {
    if (node === null || typeof node !== "object" || Array.isArray(node)) return false;

    const obj = node as Record<string, unknown>;

    for (const key of Object.keys(obj)) {
        const value = obj[key];

        if (key === "$and") {
            // AND: empty if ANY conjunct forces empty.
            if (Array.isArray(value) && value.some((c) => forcesEmpty(c))) return true;
            continue;
        }
        if (key === "$or") {
            // OR: empty only if there is at least one branch and EVERY branch forces empty.
            if (Array.isArray(value) && value.length > 0 && value.every((c) => forcesEmpty(c)))
                return true;
            continue;
        }
        if (key === "$not" || key === "$nor") {
            // Negation inverts satisfiability — don't try to prove emptiness here.
            continue;
        }
        if (key === "$in") {
            // Value must be a member of the empty set ⇒ impossible.
            if (Array.isArray(value) && value.length === 0) return true;
            continue;
        }
        if (key === "$elemMatch") {
            // The array must contain an element satisfying the inner predicate; if
            // the inner predicate is itself unsatisfiable, no element can match.
            if (forcesEmpty(value)) return true;
            continue;
        }
        if (key.startsWith("$")) {
            // Any other operator ($eq, $gte, $ne, …): not cheaply provable as empty.
            continue;
        }

        // Plain field key `{ field: criteria }`. The criteria object is an implicit
        // AND of its operators — recurse. A field bound to a scalar/array equality
        // can't be proven empty cheaply, so non-object criteria are ignored.
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            if (forcesEmpty(value)) return true;
        }
    }

    return false;
}
