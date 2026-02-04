/**
 * Internal selector compilation logic for Mango queries.
 * This module handles the actual query-to-predicate compilation without caching.
 * For the cached version, use mangoCompile from ./mangoCompile.ts
 */

import type { MangoSelector, MangoComparisonCriteria } from "./MangoTypes";

// ============================================================================
// Types
// ============================================================================

export type Predicate = (doc: any) => boolean;

// ============================================================================
// Constants (pre-computed at module load)
// ============================================================================

/** Set of condition operators for O(1) lookup */
const CONDITION_OPERATORS = new Set([
    "$eq",
    "$ne",
    "$gt",
    "$lt",
    "$gte",
    "$lte",
    "$in",
    "$nin",
    "$exists",
    "$type",
    "$mod",
    "$regex",
    "$beginsWith",
]);

// ============================================================================
// Field access utilities (optimized for pre-compilation)
// ============================================================================

/**
 * Creates a field getter function. Pre-splits dot notation paths at compile time.
 * Returns a function that extracts the field value from a document.
 */
function createFieldGetter(path: string): (doc: any) => unknown {
    // Fast path: no dots means simple property access
    if (path.indexOf(".") === -1) {
        return (doc) => (doc != null ? doc[path] : undefined);
    }

    // Pre-split path at compile time
    const parts = path.split(".");
    const len = parts.length;

    return (doc) => {
        let current = doc;
        for (let i = 0; i < len; i++) {
            if (current == null) return undefined;
            current = current[parts[i]];
        }
        return current;
    };
}

/**
 * Creates a field existence checker. Pre-splits dot notation paths at compile time.
 */
function createFieldExistsChecker(path: string): (doc: any) => boolean {
    // Fast path: no dots
    if (path.indexOf(".") === -1) {
        return (doc) => doc != null && typeof doc === "object" && path in doc;
    }

    // Pre-split path at compile time
    const parts = path.split(".");
    const len = parts.length;

    return (doc) => {
        let current = doc;
        for (let i = 0; i < len; i++) {
            if (current == null || typeof current !== "object") return false;
            if (!(parts[i] in current)) return false;
            current = current[parts[i]];
        }
        return true;
    };
}

// ============================================================================
// Value comparison utilities
// ============================================================================

/**
 * Get the type order index for a value (inlined for performance)
 */
function getTypeIndex(value: unknown): number {
    if (value === null) return 0;
    if (value === undefined) return 1;
    const t = typeof value;
    if (t === "boolean") return 2;
    if (t === "number") return 3;
    if (t === "string") return 4;
    if (Array.isArray(value)) return 5;
    return 6; // object
}

/**
 * Get the CouchDB type name for a value
 */
function getValueType(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
}

/**
 * Compare two values using CouchDB-style collation ordering.
 * Optimized with fast paths for common cases.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function compareValues(a: unknown, b: unknown): number {
    // Fast path: strict equality (handles most primitive cases)
    if (a === b) return 0;

    // Get type indices
    const typeA = getTypeIndex(a);
    const typeB = getTypeIndex(b);

    // Different types: compare by type order
    if (typeA !== typeB) return typeA - typeB;

    // Same type comparisons (type already checked, so we can use direct comparisons)
    switch (typeA) {
        case 0: // null
            return 0;
        case 1: // undefined
            return 0;
        case 2: // boolean
            return (a as boolean) === (b as boolean) ? 0 : (a as boolean) ? 1 : -1;
        case 3: // number
            return (a as number) - (b as number);
        case 4: // string
            // Use simple comparison for performance
            return (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0;
        case 5: // array
            return compareArrays(a as unknown[], b as unknown[]);
        case 6: // object
            return compareObjects(a as object, b as object);
    }
    return 0;
}

/**
 * Compare two arrays element by element
 */
function compareArrays(a: unknown[], b: unknown[]): number {
    const minLen = a.length < b.length ? a.length : b.length;
    for (let i = 0; i < minLen; i++) {
        const cmp = compareValues(a[i], b[i]);
        if (cmp !== 0) return cmp;
    }
    return a.length - b.length;
}

/**
 * Compare two objects (fallback comparison using sorted keys)
 */
function compareObjects(a: object, b: object): number {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();

    // Compare key count first
    if (keysA.length !== keysB.length) return keysA.length - keysB.length;

    // Compare keys and values
    for (let i = 0; i < keysA.length; i++) {
        if (keysA[i] !== keysB[i]) {
            return keysA[i] < keysB[i] ? -1 : 1;
        }
        const cmp = compareValues((a as any)[keysA[i]], (b as any)[keysB[i]]);
        if (cmp !== 0) return cmp;
    }
    return 0;
}

// ============================================================================
// Predicate compilation
// ============================================================================

/**
 * Compile a matcher for primitive values (used by $elemMatch, $allMatch, $keyMapMatch).
 * Needs access to compileSelector for recursive compilation.
 */
function compilePrimitiveMatcher(
    selector: MangoSelector,
    compileFunc: (q: MangoSelector) => Predicate,
): (elem: unknown) => boolean {
    const keys = Object.keys(selector);

    // Check if all keys are condition operators
    let allConditions = true;
    for (let i = 0; i < keys.length; i++) {
        if (!CONDITION_OPERATORS.has(keys[i])) {
            allConditions = false;
            break;
        }
    }

    if (!allConditions || keys.length === 0) {
        // Treat as object selector
        const subPred = compileFunc(selector);
        return (elem) => subPred(elem);
    }

    // Build primitive predicates
    const predicates: Array<(elem: unknown) => boolean> = [];

    for (let i = 0; i < keys.length; i++) {
        const op = keys[i];
        const val = (selector as any)[op];

        switch (op) {
            case "$eq":
                predicates.push((elem) => compareValues(elem, val) === 0);
                break;
            case "$ne":
                predicates.push((elem) => compareValues(elem, val) !== 0);
                break;
            case "$gt":
                predicates.push((elem) => compareValues(elem, val) > 0);
                break;
            case "$lt":
                predicates.push((elem) => compareValues(elem, val) < 0);
                break;
            case "$gte":
                predicates.push((elem) => compareValues(elem, val) >= 0);
                break;
            case "$lte":
                predicates.push((elem) => compareValues(elem, val) <= 0);
                break;
            case "$in":
                if (Array.isArray(val)) {
                    const arr = val;
                    predicates.push((elem) => {
                        for (let j = 0; j < arr.length; j++) {
                            if (compareValues(elem, arr[j]) === 0) return true;
                        }
                        return false;
                    });
                } else {
                    return () => false;
                }
                break;
            case "$nin":
                if (Array.isArray(val)) {
                    const arr = val;
                    predicates.push((elem) => {
                        for (let j = 0; j < arr.length; j++) {
                            if (compareValues(elem, arr[j]) === 0) return false;
                        }
                        return true;
                    });
                } else {
                    return () => false;
                }
                break;
            case "$type":
                predicates.push((elem) => getValueType(elem) === val);
                break;
            case "$regex":
                if (typeof val === "string") {
                    try {
                        const regex = new RegExp(val);
                        predicates.push((elem) => typeof elem === "string" && regex.test(elem));
                    } catch {
                        return () => false;
                    }
                } else {
                    return () => false;
                }
                break;
            case "$beginsWith":
                if (typeof val === "string") {
                    const prefix = val;
                    predicates.push(
                        (elem) => typeof elem === "string" && elem.startsWith(prefix),
                    );
                } else {
                    return () => false;
                }
                break;
            case "$mod":
                if (
                    Array.isArray(val) &&
                    val.length === 2 &&
                    typeof val[0] === "number" &&
                    typeof val[1] === "number" &&
                    val[0] !== 0 &&
                    Number.isInteger(val[0]) &&
                    Number.isInteger(val[1])
                ) {
                    const divisor = val[0];
                    const remainder = val[1];
                    predicates.push(
                        (elem) =>
                            typeof elem === "number" &&
                            Number.isInteger(elem) &&
                            elem % divisor === remainder,
                    );
                } else {
                    return () => false;
                }
                break;
            default:
                console.warn(
                    `[MangoQuery] Unsupported operator "${op}" in primitive matcher. ` +
                        `Supported operators: $eq, $ne, $gt, $lt, $gte, $lte, $in, $nin, $type, $regex, $beginsWith, $mod. ` +
                        `This condition will always return false.`,
                );
                return () => false;
        }
    }

    // Return combined predicate
    const len = predicates.length;
    if (len === 1) return predicates[0];

    return (elem) => {
        for (let i = 0; i < len; i++) {
            if (!predicates[i](elem)) return false;
        }
        return true;
    };
}

/**
 * Compile field criteria into a predicate (optimized)
 */
function compileFieldCriteria(
    field: string,
    criteria: MangoComparisonCriteria,
    compileFunc: (q: MangoSelector) => Predicate,
): Predicate {
    const getValue = createFieldGetter(field);
    const ops = Object.keys(criteria);
    const predicates: Predicate[] = [];

    for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        const val = (criteria as any)[op];

        switch (op) {
            case "$eq":
                // Fast path for primitive equality
                if (val === null || typeof val !== "object") {
                    predicates.push((doc) => getValue(doc) === val);
                } else {
                    predicates.push((doc) => compareValues(getValue(doc), val) === 0);
                }
                break;

            case "$ne":
                if (val === null || typeof val !== "object") {
                    predicates.push((doc) => getValue(doc) !== val);
                } else {
                    predicates.push((doc) => compareValues(getValue(doc), val) !== 0);
                }
                break;

            case "$gt":
                // Fast path for numbers (most common)
                if (typeof val === "number") {
                    predicates.push((doc) => {
                        const v = getValue(doc);
                        return typeof v === "number" && v > val;
                    });
                } else {
                    predicates.push((doc) => compareValues(getValue(doc), val) > 0);
                }
                break;

            case "$lt":
                if (typeof val === "number") {
                    predicates.push((doc) => {
                        const v = getValue(doc);
                        return typeof v === "number" && v < val;
                    });
                } else {
                    predicates.push((doc) => compareValues(getValue(doc), val) < 0);
                }
                break;

            case "$gte":
                if (typeof val === "number") {
                    predicates.push((doc) => {
                        const v = getValue(doc);
                        return typeof v === "number" && v >= val;
                    });
                } else {
                    predicates.push((doc) => compareValues(getValue(doc), val) >= 0);
                }
                break;

            case "$lte":
                if (typeof val === "number") {
                    predicates.push((doc) => {
                        const v = getValue(doc);
                        return typeof v === "number" && v <= val;
                    });
                } else {
                    predicates.push((doc) => compareValues(getValue(doc), val) <= 0);
                }
                break;

            case "$in":
                if (!Array.isArray(val)) {
                    return () => false;
                }
                // Fast path: all primitives
                if (val.every((v) => v === null || typeof v !== "object")) {
                    const set = new Set(val);
                    predicates.push((doc) => set.has(getValue(doc)));
                } else {
                    const arr = val;
                    predicates.push((doc) => {
                        const docVal = getValue(doc);
                        for (let j = 0; j < arr.length; j++) {
                            if (compareValues(docVal, arr[j]) === 0) return true;
                        }
                        return false;
                    });
                }
                break;

            case "$nin":
                if (!Array.isArray(val)) {
                    return () => false;
                }
                if (val.every((v) => v === null || typeof v !== "object")) {
                    const set = new Set(val);
                    predicates.push((doc) => !set.has(getValue(doc)));
                } else {
                    const arr = val;
                    predicates.push((doc) => {
                        const docVal = getValue(doc);
                        for (let j = 0; j < arr.length; j++) {
                            if (compareValues(docVal, arr[j]) === 0) return false;
                        }
                        return true;
                    });
                }
                break;

            case "$exists": {
                if (typeof val !== "boolean") {
                    return () => false;
                }
                const checkExists = createFieldExistsChecker(field);
                predicates.push(val ? checkExists : (doc) => !checkExists(doc));
                break;
            }

            case "$type":
                predicates.push((doc) => getValueType(getValue(doc)) === val);
                break;

            case "$size":
                if (typeof val !== "number") {
                    return () => false;
                }
                predicates.push((doc) => {
                    const v = getValue(doc);
                    return Array.isArray(v) && v.length === val;
                });
                break;

            case "$mod":
                if (
                    !Array.isArray(val) ||
                    val.length !== 2 ||
                    typeof val[0] !== "number" ||
                    typeof val[1] !== "number" ||
                    val[0] === 0 ||
                    !Number.isInteger(val[0]) ||
                    !Number.isInteger(val[1])
                ) {
                    return () => false;
                }
                {
                    const divisor = val[0];
                    const remainder = val[1];
                    predicates.push((doc) => {
                        const v = getValue(doc);
                        return (
                            typeof v === "number" && Number.isInteger(v) && v % divisor === remainder
                        );
                    });
                }
                break;

            case "$regex":
                if (typeof val !== "string") {
                    return () => false;
                }
                try {
                    const regex = new RegExp(val);
                    predicates.push((doc) => {
                        const v = getValue(doc);
                        return typeof v === "string" && regex.test(v);
                    });
                } catch {
                    return () => false;
                }
                break;

            case "$beginsWith":
                if (typeof val !== "string") {
                    return () => false;
                }
                {
                    const prefix = val;
                    predicates.push((doc) => {
                        const v = getValue(doc);
                        return typeof v === "string" && v.startsWith(prefix);
                    });
                }
                break;

            case "$all":
                if (!Array.isArray(val)) {
                    return () => false;
                }
                {
                    const required = val;
                    predicates.push((doc) => {
                        const v = getValue(doc);
                        if (!Array.isArray(v)) return false;
                        for (let j = 0; j < required.length; j++) {
                            let found = false;
                            for (let k = 0; k < v.length; k++) {
                                if (compareValues(v[k], required[j]) === 0) {
                                    found = true;
                                    break;
                                }
                            }
                            if (!found) return false;
                        }
                        return true;
                    });
                }
                break;

            case "$elemMatch":
                if (val === null || typeof val !== "object") {
                    return () => false;
                }
                {
                    const elemPred = compilePrimitiveMatcher(val as MangoSelector, compileFunc);
                    predicates.push((doc) => {
                        const v = getValue(doc);
                        if (!Array.isArray(v)) return false;
                        for (let j = 0; j < v.length; j++) {
                            if (elemPred(v[j])) return true;
                        }
                        return false;
                    });
                }
                break;

            case "$allMatch":
                if (val === null || typeof val !== "object") {
                    return () => false;
                }
                {
                    const elemPred = compilePrimitiveMatcher(val as MangoSelector, compileFunc);
                    predicates.push((doc) => {
                        const v = getValue(doc);
                        if (!Array.isArray(v) || v.length === 0) return false;
                        for (let j = 0; j < v.length; j++) {
                            if (!elemPred(v[j])) return false;
                        }
                        return true;
                    });
                }
                break;

            case "$keyMapMatch":
                if (val === null || typeof val !== "object") {
                    return () => false;
                }
                {
                    const keyPred = compilePrimitiveMatcher(val as MangoSelector, compileFunc);
                    predicates.push((doc) => {
                        const v = getValue(doc);
                        if (v === null || typeof v !== "object" || Array.isArray(v)) {
                            return false;
                        }
                        const keys = Object.keys(v);
                        for (let j = 0; j < keys.length; j++) {
                            if (keyPred(keys[j])) return true;
                        }
                        return false;
                    });
                }
                break;

            default:
                console.warn(
                    `[MangoQuery] Unsupported field operator "${op}" for field "${field}". ` +
                        `Supported operators: $eq, $ne, $gt, $lt, $gte, $lte, $in, $nin, $exists, $type, $size, ` +
                        `$mod, $regex, $beginsWith, $all, $elemMatch, $allMatch, $keyMapMatch. ` +
                        `This condition will always return false.`,
                );
                return () => false;
        }
    }

    // Return optimized combined predicate
    const len = predicates.length;
    if (len === 0) return () => true;
    if (len === 1) return predicates[0];

    return (doc) => {
        for (let i = 0; i < len; i++) {
            if (!predicates[i](doc)) return false;
        }
        return true;
    };
}

/**
 * Compile a Mango query selector into a filter function (no caching).
 *
 * @param q - The Mango query selector to compile
 * @param compileFunc - Function to use for recursive compilation (allows cache integration)
 * @returns A predicate function that returns true if a document matches the query
 */
export function compileSelector(
    q: MangoSelector,
    compileFunc: (q: MangoSelector) => Predicate = compileSelector,
): Predicate {
    // Handle invalid query
    if (q === null || typeof q !== "object") {
        return () => false;
    }

    // Handle empty query
    const keys = Object.keys(q);
    if (keys.length === 0) {
        return () => true;
    }

    const predicates: Predicate[] = [];

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = (q as any)[key];

        // Handle combination operators
        switch (key) {
            case "$or": {
                if (!Array.isArray(value)) throw new Error("$or must be an array of query objects");
                const subs = value.map((v) => compileFunc(v));
                const subLen = subs.length;
                predicates.push((doc) => {
                    for (let j = 0; j < subLen; j++) {
                        if (subs[j](doc)) return true;
                    }
                    return false;
                });
                continue;
            }

            case "$and": {
                if (!Array.isArray(value))
                    throw new Error("$and must be an array of query objects");
                const subs = value.map((v) => compileFunc(v));
                const subLen = subs.length;
                predicates.push((doc) => {
                    for (let j = 0; j < subLen; j++) {
                        if (!subs[j](doc)) return false;
                    }
                    return true;
                });
                continue;
            }

            case "$not": {
                if (value === null || typeof value !== "object" || Array.isArray(value)) {
                    throw new Error("$not must be a selector object");
                }
                const sub = compileFunc(value as MangoSelector);
                predicates.push((doc) => !sub(doc));
                continue;
            }

            case "$nor": {
                if (!Array.isArray(value))
                    throw new Error("$nor must be an array of query objects");
                const subs = value.map((v) => compileFunc(v));
                const subLen = subs.length;
                predicates.push((doc) => {
                    for (let j = 0; j < subLen; j++) {
                        if (subs[j](doc)) return false;
                    }
                    return true;
                });
                continue;
            }
        }

        // Handle primitive equality (fast path)
        if (value === null || typeof value !== "object") {
            const getValue = createFieldGetter(key);
            predicates.push((doc) => getValue(doc) === value);
            continue;
        }

        // Handle field comparison object
        if (!Array.isArray(value)) {
            const valueKeys = Object.keys(value);
            let hasOperators = false;
            for (let j = 0; j < valueKeys.length; j++) {
                if (valueKeys[j].charCodeAt(0) === 36) {
                    // '$' character
                    hasOperators = true;
                    break;
                }
            }

            if (hasOperators) {
                predicates.push(
                    compileFieldCriteria(key, value as MangoComparisonCriteria, compileFunc),
                );
            } else {
                // Nested object equality
                const getValue = createFieldGetter(key);
                predicates.push((doc) => compareValues(getValue(doc), value) === 0);
            }
            continue;
        }

        // Unsupported criteria type (e.g., array value for a field)
        console.warn(
            `[MangoQuery] Unsupported criteria type for key "${key}". ` +
                `Expected primitive value, operator object, or nested object. Got: ${Array.isArray(value) ? "array" : typeof value}. ` +
                `This condition will always return false.`,
        );
        predicates.push(() => false);
    }

    // Return optimized combined predicate
    const len = predicates.length;
    if (len === 0) return () => true;
    if (len === 1) return predicates[0];

    return (doc) => {
        for (let i = 0; i < len; i++) {
            if (!predicates[i](doc)) return false;
        }
        return true;
    };
}
