/**
 * Parameterized selector compilation for template-based caching.
 *
 * This module compiles normalized templates (with placeholder markers) into
 * parameterized predicates that read values from a runtime array.
 *
 * The compiled predicate has the signature:
 * `(doc: any, vars: unknown[]) => boolean`
 *
 * This allows the expensive compilation work to be done once per template
 * structure, then reused with different values by passing them at runtime.
 */

import type { MangoSelector, MangoComparisonCriteria } from "./MangoTypes";
import { isPlaceholder, type ValuePlaceholder } from "./templateNormalize";

// ============================================================================
// Types
// ============================================================================

/** Parameterized predicate that takes document and values array */
export type ParameterizedPredicate = (doc: any, vars: unknown[]) => boolean;

// ============================================================================
// Constants
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
// Field access utilities
// ============================================================================

/**
 * Creates a field getter function. Pre-splits dot notation paths at compile time.
 */
function createFieldGetter(path: string): (doc: any) => unknown {
    if (path.indexOf(".") === -1) {
        return (doc) => (doc != null ? doc[path] : undefined);
    }

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
 * Creates a field existence checker.
 * Treats `undefined` values as non-existing, consistent with JSON semantics
 * and IndexedDB behavior (which strips `undefined` values on storage).
 */
function createFieldExistsChecker(path: string): (doc: any) => boolean {
    if (path.indexOf(".") === -1) {
        return (doc) =>
            doc != null && typeof doc === "object" && path in doc && doc[path] !== undefined;
    }

    const parts = path.split(".");
    const len = parts.length;

    return (doc) => {
        let current = doc;
        for (let i = 0; i < len; i++) {
            if (current == null || typeof current !== "object") return false;
            if (!(parts[i] in current)) return false;
            current = current[parts[i]];
        }
        return current !== undefined;
    };
}

// ============================================================================
// Value comparison utilities
// ============================================================================

function getTypeIndex(value: unknown): number {
    if (value === null) return 0;
    if (value === undefined) return 1;
    const t = typeof value;
    if (t === "boolean") return 2;
    if (t === "number") return 3;
    if (t === "string") return 4;
    if (Array.isArray(value)) return 5;
    return 6;
}

function getValueType(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
}

function compareValues(a: unknown, b: unknown): number {
    if (a === b) return 0;

    const typeA = getTypeIndex(a);
    const typeB = getTypeIndex(b);

    if (typeA !== typeB) return typeA - typeB;

    switch (typeA) {
        case 0:
        case 1:
            return 0;
        case 2:
            return (a as boolean) === (b as boolean) ? 0 : (a as boolean) ? 1 : -1;
        case 3:
            return (a as number) - (b as number);
        case 4:
            return (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0;
        case 5:
            return compareArrays(a as unknown[], b as unknown[]);
        case 6:
            return compareObjects(a as object, b as object);
    }
    return 0;
}

function compareArrays(a: unknown[], b: unknown[]): number {
    const minLen = a.length < b.length ? a.length : b.length;
    for (let i = 0; i < minLen; i++) {
        const cmp = compareValues(a[i], b[i]);
        if (cmp !== 0) return cmp;
    }
    return a.length - b.length;
}

function compareObjects(a: object, b: object): number {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();

    if (keysA.length !== keysB.length) return keysA.length - keysB.length;

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
// Predicate compilation for templates
// ============================================================================

/**
 * Compile a primitive matcher for templates (used by $elemMatch, etc.)
 */
function compilePrimitiveMatcher(
    selector: MangoSelector,
    compileFunc: (q: MangoSelector) => ParameterizedPredicate,
): (elem: unknown, vars: unknown[]) => boolean {
    // Check if all keys are condition operators using for...in (no array allocation)
    let allConditions = true;
    let hasKeys = false;
    for (const k in selector) {
        hasKeys = true;
        if (!CONDITION_OPERATORS.has(k)) {
            allConditions = false;
            break;
        }
    }

    if (!allConditions || !hasKeys) {
        const subPred = compileFunc(selector);
        return (elem, vars) => subPred(elem, vars);
    }

    const predicates: Array<(elem: unknown, vars: unknown[]) => boolean> = [];

    // Use for...in to avoid Object.keys() allocation
    for (const op in selector) {
        const valOrPlaceholder = (selector as any)[op];

        // Check if this is a placeholder
        if (isPlaceholder(valOrPlaceholder)) {
            const idx = valOrPlaceholder.$__idx;
            switch (op) {
                case "$eq":
                    predicates.push((elem, vars) => compareValues(elem, vars[idx]) === 0);
                    break;
                case "$ne":
                    predicates.push((elem, vars) => compareValues(elem, vars[idx]) !== 0);
                    break;
                case "$gt":
                    predicates.push((elem, vars) => compareValues(elem, vars[idx]) > 0);
                    break;
                case "$lt":
                    predicates.push((elem, vars) => compareValues(elem, vars[idx]) < 0);
                    break;
                case "$gte":
                    predicates.push((elem, vars) => compareValues(elem, vars[idx]) >= 0);
                    break;
                case "$lte":
                    predicates.push((elem, vars) => compareValues(elem, vars[idx]) <= 0);
                    break;
                case "$in":
                    predicates.push((elem, vars) => {
                        const arr = vars[idx];
                        if (!Array.isArray(arr)) return false;
                        for (let j = 0; j < arr.length; j++) {
                            if (compareValues(elem, arr[j]) === 0) return true;
                        }
                        return false;
                    });
                    break;
                case "$nin":
                    predicates.push((elem, vars) => {
                        const arr = vars[idx];
                        if (!Array.isArray(arr)) return false;
                        for (let j = 0; j < arr.length; j++) {
                            if (compareValues(elem, arr[j]) === 0) return false;
                        }
                        return true;
                    });
                    break;
                case "$type":
                    predicates.push((elem, vars) => getValueType(elem) === vars[idx]);
                    break;
                case "$regex":
                    predicates.push((elem, vars) => {
                        const pattern = vars[idx];
                        if (typeof pattern !== "string") return false;
                        try {
                            const regex = new RegExp(pattern);
                            return typeof elem === "string" && regex.test(elem);
                        } catch {
                            return false;
                        }
                    });
                    break;
                case "$beginsWith":
                    predicates.push((elem, vars) => {
                        const prefix = vars[idx];
                        return (
                            typeof prefix === "string" &&
                            typeof elem === "string" &&
                            elem.startsWith(prefix)
                        );
                    });
                    break;
                case "$mod":
                    predicates.push((elem, vars) => {
                        const modVal = vars[idx];
                        if (
                            !Array.isArray(modVal) ||
                            modVal.length !== 2 ||
                            typeof modVal[0] !== "number" ||
                            typeof modVal[1] !== "number" ||
                            modVal[0] === 0
                        ) {
                            return false;
                        }
                        return (
                            typeof elem === "number" &&
                            Number.isInteger(elem) &&
                            elem % modVal[0] === modVal[1]
                        );
                    });
                    break;
                default:
                    return () => false;
            }
        } else {
            // Static value (shouldn't happen in normalized templates, but handle gracefully)
            const val = valOrPlaceholder;
            switch (op) {
                case "$eq":
                    predicates.push((elem) => compareValues(elem, val) === 0);
                    break;
                case "$ne":
                    predicates.push((elem) => compareValues(elem, val) !== 0);
                    break;
                default:
                    // For other operators with static values, use compareValues
                    predicates.push((elem) => compareValues(elem, val) === 0);
            }
        }
    }

    const len = predicates.length;
    if (len === 1) return predicates[0];

    return (elem, vars) => {
        for (let i = 0; i < len; i++) {
            if (!predicates[i](elem, vars)) return false;
        }
        return true;
    };
}

/**
 * Compile field criteria into a parameterized predicate.
 */
function compileFieldCriteria(
    field: string,
    criteria: MangoComparisonCriteria,
    compileFunc: (q: MangoSelector) => ParameterizedPredicate,
): ParameterizedPredicate {
    const getValue = createFieldGetter(field);
    const predicates: ParameterizedPredicate[] = [];

    // Use for...in to avoid Object.keys() allocation
    for (const op in criteria) {
        const valOrPlaceholder = (criteria as any)[op];

        // Check if this operator's value is a placeholder
        if (isPlaceholder(valOrPlaceholder)) {
            const idx = valOrPlaceholder.$__idx;

            switch (op) {
                case "$eq":
                    predicates.push((doc, vars) => {
                        const val = vars[idx];
                        const docVal = getValue(doc);
                        if (val === null || typeof val !== "object") {
                            return docVal === val;
                        }
                        return compareValues(docVal, val) === 0;
                    });
                    break;

                case "$ne":
                    predicates.push((doc, vars) => {
                        const val = vars[idx];
                        const docVal = getValue(doc);
                        if (val === null || typeof val !== "object") {
                            return docVal !== val;
                        }
                        return compareValues(docVal, val) !== 0;
                    });
                    break;

                case "$gt":
                    predicates.push((doc, vars) => {
                        const val = vars[idx];
                        if (typeof val === "number") {
                            const v = getValue(doc);
                            return typeof v === "number" && v > val;
                        }
                        return compareValues(getValue(doc), val) > 0;
                    });
                    break;

                case "$lt":
                    predicates.push((doc, vars) => {
                        const val = vars[idx];
                        if (typeof val === "number") {
                            const v = getValue(doc);
                            return typeof v === "number" && v < val;
                        }
                        return compareValues(getValue(doc), val) < 0;
                    });
                    break;

                case "$gte":
                    predicates.push((doc, vars) => {
                        const val = vars[idx];
                        if (typeof val === "number") {
                            const v = getValue(doc);
                            return typeof v === "number" && v >= val;
                        }
                        return compareValues(getValue(doc), val) >= 0;
                    });
                    break;

                case "$lte":
                    predicates.push((doc, vars) => {
                        const val = vars[idx];
                        if (typeof val === "number") {
                            const v = getValue(doc);
                            return typeof v === "number" && v <= val;
                        }
                        return compareValues(getValue(doc), val) <= 0;
                    });
                    break;

                case "$in":
                    predicates.push((doc, vars) => {
                        const arr = vars[idx];
                        if (!Array.isArray(arr)) return false;
                        const docVal = getValue(doc);
                        const len = arr.length;
                        // Use simple loop - avoids .every() and .includes() function call overhead
                        for (let j = 0; j < len; j++) {
                            const v = arr[j];
                            // Fast path for primitives
                            if (v === docVal) return true;
                            // Full comparison for objects/arrays
                            if (v !== null && typeof v === "object") {
                                if (compareValues(docVal, v) === 0) return true;
                            }
                        }
                        return false;
                    });
                    break;

                case "$nin":
                    predicates.push((doc, vars) => {
                        const arr = vars[idx];
                        if (!Array.isArray(arr)) return false;
                        const docVal = getValue(doc);
                        const len = arr.length;
                        for (let j = 0; j < len; j++) {
                            const v = arr[j];
                            if (v === docVal) return false;
                            if (v !== null && typeof v === "object") {
                                if (compareValues(docVal, v) === 0) return false;
                            }
                        }
                        return true;
                    });
                    break;

                case "$exists": {
                    const checkExists = createFieldExistsChecker(field);
                    predicates.push((doc, vars) => {
                        const shouldExist = vars[idx];
                        if (typeof shouldExist !== "boolean") return false;
                        return shouldExist ? checkExists(doc) : !checkExists(doc);
                    });
                    break;
                }

                case "$type":
                    predicates.push((doc, vars) => getValueType(getValue(doc)) === vars[idx]);
                    break;

                case "$size":
                    predicates.push((doc, vars) => {
                        const size = vars[idx];
                        if (typeof size !== "number") return false;
                        const v = getValue(doc);
                        return Array.isArray(v) && v.length === size;
                    });
                    break;

                case "$mod":
                    predicates.push((doc, vars) => {
                        const modVal = vars[idx];
                        if (
                            !Array.isArray(modVal) ||
                            modVal.length !== 2 ||
                            typeof modVal[0] !== "number" ||
                            typeof modVal[1] !== "number" ||
                            modVal[0] === 0 ||
                            !Number.isInteger(modVal[0]) ||
                            !Number.isInteger(modVal[1])
                        ) {
                            return false;
                        }
                        const v = getValue(doc);
                        return (
                            typeof v === "number" &&
                            Number.isInteger(v) &&
                            v % modVal[0] === modVal[1]
                        );
                    });
                    break;

                case "$regex":
                    predicates.push((doc, vars) => {
                        const pattern = vars[idx];
                        if (typeof pattern !== "string") return false;
                        try {
                            const regex = new RegExp(pattern);
                            const v = getValue(doc);
                            return typeof v === "string" && regex.test(v);
                        } catch {
                            return false;
                        }
                    });
                    break;

                case "$beginsWith":
                    predicates.push((doc, vars) => {
                        const prefix = vars[idx];
                        if (typeof prefix !== "string") return false;
                        const v = getValue(doc);
                        return typeof v === "string" && v.startsWith(prefix);
                    });
                    break;

                case "$all":
                    predicates.push((doc, vars) => {
                        const required = vars[idx];
                        if (!Array.isArray(required)) return false;
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
                    break;

                default:
                    console.warn(
                        `[MangoQuery] Unsupported parameterized operator "${op}" for field "${field}".`,
                    );
                    return () => false;
            }
        } else if (op === "$elemMatch" || op === "$allMatch" || op === "$keyMapMatch") {
            // These operators contain nested selectors (already normalized)
            const nestedSelector = valOrPlaceholder as MangoSelector;
            if (nestedSelector === null || typeof nestedSelector !== "object") {
                return () => false;
            }

            const elemPred = compilePrimitiveMatcher(nestedSelector, compileFunc);

            if (op === "$elemMatch") {
                predicates.push((doc, vars) => {
                    const v = getValue(doc);
                    if (!Array.isArray(v)) return false;
                    for (let j = 0; j < v.length; j++) {
                        if (elemPred(v[j], vars)) return true;
                    }
                    return false;
                });
            } else if (op === "$allMatch") {
                predicates.push((doc, vars) => {
                    const v = getValue(doc);
                    if (!Array.isArray(v) || v.length === 0) return false;
                    for (let j = 0; j < v.length; j++) {
                        if (!elemPred(v[j], vars)) return false;
                    }
                    return true;
                });
            } else if (op === "$keyMapMatch") {
                predicates.push((doc, vars) => {
                    const v = getValue(doc);
                    if (v === null || typeof v !== "object" || Array.isArray(v)) {
                        return false;
                    }
                    const keys = Object.keys(v);
                    for (let j = 0; j < keys.length; j++) {
                        if (elemPred(keys[j], vars)) return true;
                    }
                    return false;
                });
            }
        } else {
            // Static value in template (shouldn't happen, but handle gracefully)
            const val = valOrPlaceholder;
            switch (op) {
                case "$eq":
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
                default:
                    // Keep static behavior for unknown cases
                    predicates.push((doc) => compareValues(getValue(doc), val) === 0);
            }
        }
    }

    const len = predicates.length;
    if (len === 0) return () => true;
    if (len === 1) return predicates[0];

    return (doc, vars) => {
        for (let i = 0; i < len; i++) {
            if (!predicates[i](doc, vars)) return false;
        }
        return true;
    };
}

/**
 * Compile a normalized template selector into a parameterized predicate.
 *
 * @param template - The normalized template selector (with placeholders)
 * @returns A parameterized predicate function (doc, vars) => boolean
 */
export function compileTemplateSelector(template: MangoSelector): ParameterizedPredicate {
    // Handle invalid template
    if (template === null || typeof template !== "object") {
        return () => false;
    }

    // Check for empty template without Object.keys() allocation
    let hasKeys = false;
    for (const _ in template) {
        hasKeys = true;
        break;
    }
    if (!hasKeys) {
        return () => true;
    }

    const predicates: ParameterizedPredicate[] = [];

    // Use for...in to avoid Object.keys() array allocation
    for (const key in template) {
        const value = (template as any)[key];

        // Handle combination operators
        switch (key) {
            case "$or": {
                if (!Array.isArray(value)) throw new Error("$or must be an array");
                const subs = value.map((v) => compileTemplateSelector(v));
                const subLen = subs.length;
                predicates.push((doc, vars) => {
                    for (let j = 0; j < subLen; j++) {
                        if (subs[j](doc, vars)) return true;
                    }
                    return false;
                });
                continue;
            }

            case "$and": {
                if (!Array.isArray(value)) throw new Error("$and must be an array");
                const subs = value.map((v) => compileTemplateSelector(v));
                const subLen = subs.length;
                predicates.push((doc, vars) => {
                    for (let j = 0; j < subLen; j++) {
                        if (!subs[j](doc, vars)) return false;
                    }
                    return true;
                });
                continue;
            }

            case "$not": {
                if (value === null || typeof value !== "object" || Array.isArray(value)) {
                    throw new Error("$not must be a selector object");
                }
                const sub = compileTemplateSelector(value as MangoSelector);
                predicates.push((doc, vars) => !sub(doc, vars));
                continue;
            }

            case "$nor": {
                if (!Array.isArray(value)) throw new Error("$nor must be an array");
                const subs = value.map((v) => compileTemplateSelector(v));
                const subLen = subs.length;
                predicates.push((doc, vars) => {
                    for (let j = 0; j < subLen; j++) {
                        if (subs[j](doc, vars)) return false;
                    }
                    return true;
                });
                continue;
            }
        }

        // Check if value is a placeholder (direct field value)
        if (isPlaceholder(value)) {
            const idx = value.$__idx;
            const getValue = createFieldGetter(key);
            predicates.push((doc, vars) => getValue(doc) === vars[idx]);
            continue;
        }

        // Handle primitive value (booleans are kept static in templates)
        if (value === null || typeof value !== "object") {
            const getValue = createFieldGetter(key);
            const staticVal = value;
            predicates.push((doc) => getValue(doc) === staticVal);
            continue;
        }

        // Handle field comparison object
        if (!Array.isArray(value)) {
            // Check for operators without Object.keys() allocation
            let hasOperators = false;
            for (const k in value) {
                if (k.charCodeAt(0) === 36) {
                    hasOperators = true;
                    break;
                }
            }

            if (hasOperators) {
                predicates.push(
                    compileFieldCriteria(key, value as MangoComparisonCriteria, compileTemplateSelector),
                );
            } else if (isPlaceholder(value)) {
                // This case is handled above, but double-check
                const idx = (value as ValuePlaceholder).$__idx;
                const getValue = createFieldGetter(key);
                predicates.push((doc, vars) => getValue(doc) === vars[idx]);
            } else {
                // Nested object equality (static)
                const getValue = createFieldGetter(key);
                predicates.push((doc) => compareValues(getValue(doc), value) === 0);
            }
            continue;
        }

        // Array value (shouldn't happen in normalized templates for field values)
        console.warn(`[MangoQuery] Unexpected array value for key "${key}" in template.`);
        predicates.push(() => false);
    }

    const len = predicates.length;
    if (len === 0) return () => true;
    if (len === 1) return predicates[0];

    return (doc, vars) => {
        for (let i = 0; i < len; i++) {
            if (!predicates[i](doc, vars)) return false;
        }
        return true;
    };
}
