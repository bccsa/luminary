/**
 * Template normalization for Mango queries.
 *
 * This module extracts values from queries and creates normalized "templates"
 * that can be cached independently of the specific values used.
 *
 * For example, the query:
 * ```
 * { type: "post", status: "published", count: { $gte: 5 } }
 * ```
 *
 * Becomes:
 * - Template: `{ type: { $__idx: 0 }, status: { $__idx: 1 }, count: { $gte: { $__idx: 2 } } }`
 * - Values: `["post", "published", 5]`
 *
 * This allows the compiled query logic to be cached once per template structure,
 * then reused with different values by binding them at runtime.
 */

import type { MangoSelector, MangoComparisonCriteria } from "./MangoTypes";

// ============================================================================
// Types
// ============================================================================

/** Marker object indicating a parameterized value slot */
export interface ValuePlaceholder {
    $__idx: number;
}

/** Result of normalizing a selector */
export interface NormalizedResult {
    /** The template with values replaced by placeholders */
    template: MangoSelector;
    /** The extracted values in order */
    values: unknown[];
}

/** Template selector type (same structure as MangoSelector but with placeholders) */
export type TemplateSelector = MangoSelector;

// ============================================================================
// Constants
// ============================================================================

/** Combination operators that contain nested selectors (not values) */
const COMBINATION_OPERATORS = new Set(["$and", "$or", "$not", "$nor"]);

/** Operators whose values should be extracted as parameters */
const VALUE_OPERATORS = new Set([
    "$eq",
    "$ne",
    "$gt",
    "$lt",
    "$gte",
    "$lte",
    "$in",
    "$nin",
    "$all",
    "$exists",
    "$type",
    "$size",
    "$mod",
    "$regex",
    "$beginsWith",
]);

/** Operators whose values are nested selectors (not values to extract) */
const SELECTOR_OPERATORS = new Set(["$elemMatch", "$allMatch", "$keyMapMatch"]);

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Check if a value is a placeholder marker.
 */
export function isPlaceholder(value: unknown): value is ValuePlaceholder {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "$__idx" in value &&
        typeof (value as ValuePlaceholder).$__idx === "number"
    );
}

/**
 * Normalize a Mango selector into a template and extracted values.
 *
 * This function traverses the selector and replaces all primitive values
 * with placeholder markers `{ $__idx: n }`. The original values are collected
 * into an array in traversal order.
 *
 * @param selector - The Mango selector to normalize
 * @returns Object containing the template and extracted values
 */
export function normalizeSelector(selector: MangoSelector): NormalizedResult {
    const values: unknown[] = [];
    const template = normalizeNode(selector, values);
    return { template, values };
}

/**
 * Recursively normalize a selector node.
 */
function normalizeNode(node: MangoSelector, values: unknown[]): MangoSelector {
    if (node === null || typeof node !== "object") {
        // This shouldn't happen for valid selectors, but handle gracefully
        return node as MangoSelector;
    }

    const result: MangoSelector = {};

    for (const key in node) {
        const value = node[key];

        if (COMBINATION_OPERATORS.has(key)) {
            // Handle combination operators - their values are selectors, not data values
            if (key === "$not") {
                // $not contains a single selector
                result[key] = normalizeNode(value as MangoSelector, values);
            } else {
                // $and, $or, $nor contain arrays of selectors
                if (Array.isArray(value)) {
                    result[key] = value.map((v) => normalizeNode(v as MangoSelector, values));
                } else {
                    result[key] = value;
                }
            }
        } else if (typeof value === "boolean") {
            // Keep booleans as static values in the template
            // This preserves type information needed for pushdown decisions
            // (Dexie's where() doesn't work well with boolean indexes)
            result[key] = value;
        } else if (value === null || typeof value !== "object") {
            // Primitive field value: { field: "value" }
            // Extract the value and replace with placeholder
            const idx = values.length;
            values.push(value);
            result[key] = { $__idx: idx } as unknown as MangoSelector[string];
        } else if (Array.isArray(value)) {
            // Array value for a field (unusual in Mango queries, but handle it)
            const idx = values.length;
            values.push(value);
            result[key] = { $__idx: idx } as unknown as MangoSelector[string];
        } else {
            // Object value - could be comparison criteria or nested object
            result[key] = normalizeCriteria(value as MangoComparisonCriteria, values);
        }
    }

    return result;
}

/**
 * Normalize comparison criteria object.
 * Handles operator objects like { $eq: "value", $gt: 5 }
 */
function normalizeCriteria(
    criteria: MangoComparisonCriteria,
    values: unknown[],
): MangoComparisonCriteria {
    const result: MangoComparisonCriteria = {};

    // Check if this looks like an operator object (has $ keys)
    // Use for...in to avoid Object.keys() array allocation
    let hasOperators = false;
    for (const k in criteria) {
        if (k.charCodeAt(0) === 36) {
            // '$' character
            hasOperators = true;
            break;
        }
    }

    if (!hasOperators) {
        // This is a nested object for equality comparison, not operator criteria
        // Extract the whole object as a single value
        const idx = values.length;
        values.push(criteria);
        return { $__idx: idx } as unknown as MangoComparisonCriteria;
    }

    // Process each operator using for...in (avoids array allocation)
    for (const op in criteria) {
        const opValue = (criteria as Record<string, unknown>)[op];

        if (VALUE_OPERATORS.has(op)) {
            // Extract the value and replace with placeholder
            const idx = values.length;
            values.push(opValue);
            (result as Record<string, unknown>)[op] = { $__idx: idx };
        } else if (SELECTOR_OPERATORS.has(op)) {
            // These operators contain nested selectors
            if (opValue !== null && typeof opValue === "object" && !Array.isArray(opValue)) {
                (result as Record<string, unknown>)[op] = normalizeNode(
                    opValue as MangoSelector,
                    values,
                );
            } else {
                (result as Record<string, unknown>)[op] = opValue;
            }
        } else {
            // Unknown operator - keep as-is (might be custom)
            (result as Record<string, unknown>)[op] = opValue;
        }
    }

    return result;
}

/**
 * Generate a cache key from a normalized template.
 * Uses JSON.stringify which will include the placeholder structure.
 */
export function generateTemplateKey(template: MangoSelector, prefix: string): string {
    // Use the same hashing as queryCache but on the template
    let hash = 5381;
    const str = JSON.stringify(template);
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return `${prefix}:${(hash >>> 0).toString(36)}`;
}
