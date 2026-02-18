import { MangoSelector } from "./MangoTypes";

/**
 * Expands a Mango query selector from shorthand implicit AND form to explicit $and form.
 *
 * This converts queries like:
 * ```
 * {
 *   "type": "Post",
 *   "status": "published",
 *   "$or": [{ "author": "Alice" }, { "author": "Bob" }]
 * }
 * ```
 *
 * Into the explicit form:
 * ```
 * {
 *   "$and": [
 *     { "type": "Post" },
 *     { "status": "published" },
 *     { "$or": [{ "author": "Alice" }, { "author": "Bob" }] }
 *   ]
 * }
 * ```
 *
 * This makes it possible to inject additional conditions (like permission checks)
 * into the $and array without modifying the original query structure.
 *
 * @param selector - The Mango query selector to expand
 * @returns A new selector with explicit $and structure
 */
export function expandMangoSelector(selector: MangoSelector): MangoSelector {
    // Fast path: if selector only has $and at top level, return as-is
    // This avoids unnecessary object creation for already-normalized queries
    let keyCount = 0;
    let hasOnlyAnd = false;

    for (const key in selector) {
        keyCount++;
        if (keyCount === 1 && key === "$and") {
            hasOnlyAnd = true;
        } else if (keyCount > 1 || key !== "$and") {
            hasOnlyAnd = false;
        }
        // Early exit if we know it's not normalized
        if (keyCount > 1) break;
    }

    if (keyCount === 1 && hasOnlyAnd && Array.isArray(selector.$and)) {
        return selector;
    }

    // Empty selector fast path
    if (keyCount === 0) {
        return { $and: [] };
    }

    const andConditions: MangoSelector[] = [];

    // Extract existing $and conditions and flatten them into the top-level $and
    if (selector.$and && Array.isArray(selector.$and)) {
        const existingAnd = selector.$and;
        for (let i = 0; i < existingAnd.length; i++) {
            andConditions.push(existingAnd[i]);
        }
    }

    // Process all keys in the selector
    for (const key in selector) {
        if (key === "$and") {
            // Already processed above
            continue;
        }

        // Both combination operators and regular fields become individual conditions
        andConditions.push({ [key]: selector[key] } as MangoSelector);
    }

    // If there are no conditions, return empty $and
    if (andConditions.length === 0) {
        return { $and: [] };
    }

    // Return the expanded selector with explicit $and wrapper
    return { $and: andConditions };
}
