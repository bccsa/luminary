import { MangoSelector } from "./MangoTypes";

/**
 * List of Mango query operators that should not be treated as field conditions.
 * These are combination operators used for logical operations.
 */
const COMBINATION_OPERATORS = ["$and", "$or", "$not", "$nor", "$all", "$elemMatch", "$allMatch"];

/**
 * Checks if a key is a Mango combination operator
 */
function isCombinationOperator(key: string): boolean {
    return COMBINATION_OPERATORS.includes(key);
}

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
    const andConditions: MangoSelector[] = [];

    // Extract existing $and conditions and flatten them into the top-level $and
    if (selector.$and && Array.isArray(selector.$and)) {
        for (const condition of selector.$and) {
            andConditions.push(condition);
        }
    }

    // Process all keys in the selector
    for (const key of Object.keys(selector)) {
        if (key === "$and") {
            // Already processed above
            continue;
        }

        if (isCombinationOperator(key)) {
            // Include combination operators ($or, $not, $nor, etc.) as conditions in the $and array
            andConditions.push({ [key]: selector[key] } as MangoSelector);
        } else {
            // Regular field conditions become individual conditions in the $and array
            andConditions.push({ [key]: selector[key] } as MangoSelector);
        }
    }

    // If there are no conditions, return empty $and
    if (andConditions.length === 0) {
        return { $and: [] };
    }

    // Always return the expanded selector with explicit $and wrapper
    return { $and: andConditions };
}
