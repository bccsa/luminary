import type { Collection, Table } from "dexie";
import type { MangoQuery, MangoSelector } from "./MangoTypes";
import { mangoCompile } from "./mangoCompile";
import { expandMangoSelector } from "./expandMangoQuery";
import {
    generateCacheKey,
    cacheGet,
    cacheSet,
    clearCacheByPrefix,
    getCacheStats,
    CACHE_PREFIX_DEXIE,
    CACHE_PREFIX_EXPAND,
} from "./queryCache";

// ============================================================================
// Types
// ============================================================================

type Pushdown =
    | { kind: "anyOf"; field: string; values: unknown[] }
    | { kind: "eq" | "gt" | "lt" | "gte" | "lte" | "ne"; field: string; value: unknown }
    | { kind: "startsWith"; field: string; prefix: string }
    | { kind: "between"; field: string; lower: number; upper: number; includeLower: boolean; includeUpper: boolean }
    | { kind: "multiEq"; fields: Record<string, string | number> };

/** Cached result of query analysis */
interface AnalyzedQuery {
    push: Pushdown | undefined;
    residual: MangoSelector;
}

// ============================================================================
// Module-level Constants (avoid recreation on each call)
// ============================================================================

const COMBINATION_OPERATORS = new Set(["$and", "$or", "$not", "$nor"]);

/** Operator to Mango operator key mapping */
const OP_TO_MANGO: Readonly<Record<string, string>> = {
    ne: "$ne",
    gt: "$gt",
    lt: "$lt",
    gte: "$gte",
    lte: "$lte",
};

// ============================================================================
// Cache Management Exports
// ============================================================================

/**
 * Clear all cached Dexie query analysis results.
 * Does not affect mangoCompile cache.
 * For clearing all Mango caches, use clearAllMangoCache() from queryCache.
 */
export function clearDexieCache(): void {
    clearCacheByPrefix(CACHE_PREFIX_DEXIE);
    clearCacheByPrefix(CACHE_PREFIX_EXPAND);
}

/**
 * Get cache statistics for mangoToDexie.
 */
export function getDexieCacheStats(): {
    analysis: { size: number; keys: string[] };
    expanded: { size: number; keys: string[] };
} {
    return {
        analysis: getCacheStats(CACHE_PREFIX_DEXIE),
        expanded: getCacheStats(CACHE_PREFIX_EXPAND),
    };
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Convert a Mango query into a Dexie Collection, pushing index-friendly parts into Dexie.
 *
 * Query analysis results (pushdown strategy and residual selector) are cached
 * based on the query structure. Cached entries expire after 5 minutes of non-use.
 *
 * The same query used in mangoCompile will have a different cache entry
 * (different prefix) to avoid conflicts between predicate and analysis caches.
 *
 * Supported pushdown operators:
 * - `$eq` / primitive equality → `where(field).equals(value)` or `where({ f1: v1, ... })`
 * - `$ne` → `where(field).notEqual(value)`
 * - `$gt` / `$lt` / `$gte` / `$lte` → `above` / `below` / `aboveOrEqual` / `belowOrEqual`
 * - Combined `$gte` + `$lte` on same field → `where(field).between(lower, upper)`
 * - `$in` → `where(field).anyOf(values)`
 * - `$beginsWith` → `where(field).startsWith(prefix)`
 *
 * All other operators (`$or`, `$not`, `$nor`, `$nin`, `$exists`, `$type`, `$all`,
 * `$elemMatch`, `$allMatch`, `$keyMapMatch`, `$regex`, `$mod`, `$size`) are
 * handled in-memory via `mangoCompile`.
 */
export function mangoToDexie<T>(table: Table<T>, query: MangoQuery): Collection<T> {
    const selector: MangoSelector = (query?.selector || {}) as MangoSelector;
    const limit = typeof query?.$limit === "number" ? query.$limit : undefined;
    const sort = Array.isArray(query?.$sort) ? query.$sort : undefined;

    // 1) Sorting path: prefer using orderBy on an indexed field, then filter in-memory.
    if (sort && sort.length > 0) {
        const entry = sort[0];
        const sortField = Object.keys(entry)[0];
        const desc = (entry as Record<string, string>)[sortField] === "desc";

        let col: Collection<T>;
        try {
            col = table.orderBy(sortField);
            if (desc) col = col.reverse();
        } catch {
            // Fallback to an un-ordered collection filtered in-memory
            col = table.filter(() => true);
        }

        const pred = mangoCompile(selector) as (d: T) => boolean;
        col = col.filter(pred);
        if (typeof limit === "number") return col.limit(Math.max(0, limit));
        return col;
    }

    // 2) No sorting: use cached analysis or compute it
    const analysis = analyzeQuery(selector);

    if (analysis.push) {
        let col = applyWhere(table, analysis.push);
        if (!isEmptySelector(analysis.residual)) {
            const pred = mangoCompile(analysis.residual) as (d: T) => boolean;
            col = col.filter(pred);
        }
        if (typeof limit === "number") return col.limit(Math.max(0, limit));
        return col;
    }

    // 3) Fallback: in-memory filter for full selector
    const pred = mangoCompile(selector) as (d: T) => boolean;
    const base = table.filter(pred);
    if (typeof limit === "number") return base.limit(Math.max(0, limit));
    return base;
}

// ============================================================================
// Query Analysis (Cached)
// ============================================================================

/**
 * Analyze a selector to extract pushdown and residual.
 * Results are cached for repeated queries.
 */
function analyzeQuery(selector: MangoSelector): AnalyzedQuery {
    // Generate cache key with Dexie analysis prefix
    const cacheKey = generateCacheKey(selector, CACHE_PREFIX_DEXIE);

    // Check cache
    const cached = cacheGet<AnalyzedQuery>(cacheKey);
    if (cached) {
        return cached;
    }

    // Cache miss - analyze the query
    const expanded = expandSelectorCached(selector);
    const andConditions = expanded.$and || [];

    const push = extractPushdown(andConditions);
    const residual = push ? buildResidualSelector(andConditions, push) : selector;

    const result: AnalyzedQuery = { push, residual };

    // Add to cache
    cacheSet(cacheKey, result);

    return result;
}

/**
 * Expand a selector with caching.
 */
function expandSelectorCached(selector: MangoSelector): MangoSelector {
    const cacheKey = generateCacheKey(selector, CACHE_PREFIX_EXPAND);

    const cached = cacheGet<MangoSelector>(cacheKey);
    if (cached) {
        return cached;
    }

    const expanded = expandMangoSelector(selector);
    cacheSet(cacheKey, expanded);

    return expanded;
}

// ============================================================================
// Pushdown Extraction (Single Pass)
// ============================================================================

function isEmptySelector(q: MangoSelector): boolean {
    let keyCount = 0;
    let firstKey: string | null = null;

    for (const k in q) {
        if (keyCount === 0) firstKey = k;
        keyCount++;
        if (keyCount > 1) break;
    }

    if (keyCount === 0) return true;
    if (keyCount === 1 && firstKey === "$and") {
        const andArr = q.$and;
        return !andArr || andArr.length === 0;
    }
    return false;
}

/** Collected data from a single pass over conditions */
interface CollectedPushdownData {
    /** Equality fields for multiEq */
    eqMap: Record<string, string | number>;
    /** First $beginsWith found */
    startsWith: { field: string; prefix: string } | null;
    /** Range bounds by field for between detection */
    rangeMap: Record<string, { gte?: number; lte?: number; gt?: number; lt?: number }>;
    /** First $in found */
    anyOf: { field: string; values: unknown[] } | null;
    /** First single comparator found */
    singleComparator: Pushdown | null;
}

/**
 * Extract the best pushdown strategy from the $and conditions.
 * Uses a SINGLE PASS over all conditions to collect all potential pushdowns,
 * then selects the best one by priority.
 *
 * Priority:
 * 1. Combined equality fields (multiEq) - maximizes compound index usage
 * 2. $beginsWith on a string field - efficient prefix search
 * 3. Combined $gte + $lte on same numeric field - between() is very efficient
 * 4. $in on a field - anyOf() is efficient
 * 5. Single comparator ($eq, $ne, $gt, $lt, $gte, $lte)
 */
function extractPushdown(conditions: MangoSelector[]): Pushdown | undefined {
    const data: CollectedPushdownData = {
        eqMap: {},
        startsWith: null,
        rangeMap: {},
        anyOf: null,
        singleComparator: null,
    };

    let eqConflict = false;

    // Single pass over all conditions
    for (let i = 0; i < conditions.length; i++) {
        const cond = conditions[i];

        // Get first key without creating array
        let field: string | null = null;
        let keyCount = 0;
        for (const k in cond) {
            if (keyCount === 0) field = k;
            keyCount++;
            if (keyCount > 1) break;
        }

        if (keyCount !== 1 || field === null) continue;
        if (COMBINATION_OPERATORS.has(field)) continue;

        const criteria = (cond as Record<string, unknown>)[field];

        // Check primitive equality (skip booleans)
        if (typeof criteria === "string" || typeof criteria === "number") {
            // Collect for multiEq
            if (!eqConflict) {
                if (data.eqMap[field] !== undefined && data.eqMap[field] !== criteria) {
                    eqConflict = true;
                    data.eqMap = {};
                } else {
                    data.eqMap[field] = criteria;
                }
            }
            // Also track as potential single comparator
            if (!data.singleComparator) {
                data.singleComparator = { kind: "eq", field, value: criteria };
            }
            continue;
        }

        if (typeof criteria === "boolean") continue;

        // Object criteria
        if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
            const critObj = criteria as Record<string, unknown>;

            // Check $eq for multiEq
            const eqVal = critObj.$eq;
            if (typeof eqVal === "string" || typeof eqVal === "number") {
                if (!eqConflict) {
                    if (data.eqMap[field] !== undefined && data.eqMap[field] !== eqVal) {
                        eqConflict = true;
                        data.eqMap = {};
                    } else {
                        data.eqMap[field] = eqVal;
                    }
                }
                if (!data.singleComparator) {
                    data.singleComparator = { kind: "eq", field, value: eqVal };
                }
            }

            // Check $beginsWith
            const prefix = critObj.$beginsWith;
            if (!data.startsWith && typeof prefix === "string" && prefix.length > 0) {
                data.startsWith = { field, prefix };
            }

            // Check range operators for between
            if (typeof critObj.$gte === "number" || typeof critObj.$lte === "number" ||
                typeof critObj.$gt === "number" || typeof critObj.$lt === "number") {
                if (!data.rangeMap[field]) data.rangeMap[field] = {};
                if (typeof critObj.$gte === "number") data.rangeMap[field].gte = critObj.$gte;
                if (typeof critObj.$lte === "number") data.rangeMap[field].lte = critObj.$lte;
                if (typeof critObj.$gt === "number") data.rangeMap[field].gt = critObj.$gt;
                if (typeof critObj.$lt === "number") data.rangeMap[field].lt = critObj.$lt;
            }

            // Check $in for anyOf
            const inValues = critObj.$in;
            if (!data.anyOf && Array.isArray(inValues) && inValues.length > 0) {
                // Check if not all booleans
                let allBooleans = true;
                for (let j = 0; j < inValues.length; j++) {
                    if (typeof inValues[j] !== "boolean") {
                        allBooleans = false;
                        break;
                    }
                }
                if (!allBooleans) {
                    data.anyOf = { field, values: inValues };
                }
            }

            // Check single comparators (if not already found)
            if (!data.singleComparator) {
                if (typeof critObj.$gt === "number") {
                    data.singleComparator = { kind: "gt", field, value: critObj.$gt };
                } else if (typeof critObj.$lt === "number") {
                    data.singleComparator = { kind: "lt", field, value: critObj.$lt };
                } else if (typeof critObj.$gte === "number") {
                    data.singleComparator = { kind: "gte", field, value: critObj.$gte };
                } else if (typeof critObj.$lte === "number") {
                    data.singleComparator = { kind: "lte", field, value: critObj.$lte };
                } else if (critObj.$ne !== undefined && typeof critObj.$ne !== "boolean") {
                    data.singleComparator = { kind: "ne", field, value: critObj.$ne };
                }
            }
        }
    }

    // Priority 1: multiEq (if we have any equalities)
    let hasEqFields = false;
    for (const _ in data.eqMap) {
        hasEqFields = true;
        break;
    }
    if (hasEqFields) {
        return { kind: "multiEq", fields: data.eqMap };
    }

    // Priority 2: startsWith
    if (data.startsWith) {
        return { kind: "startsWith", field: data.startsWith.field, prefix: data.startsWith.prefix };
    }

    // Priority 3: between (check rangeMap for fields with both bounds)
    for (const field in data.rangeMap) {
        const range = data.rangeMap[field];
        const hasLower = range.gte !== undefined || range.gt !== undefined;
        const hasUpper = range.lte !== undefined || range.lt !== undefined;

        if (hasLower && hasUpper) {
            const lower = range.gte !== undefined ? range.gte : range.gt!;
            const upper = range.lte !== undefined ? range.lte : range.lt!;
            const includeLower = range.gte !== undefined;
            const includeUpper = range.lte !== undefined;
            return { kind: "between", field, lower, upper, includeLower, includeUpper };
        }
    }

    // Priority 4: anyOf
    if (data.anyOf) {
        return { kind: "anyOf", field: data.anyOf.field, values: data.anyOf.values };
    }

    // Priority 5: single comparator
    return data.singleComparator || undefined;
}

// ============================================================================
// Where Application
// ============================================================================

function applyWhere<T>(table: Table<T>, push: Pushdown): Collection<T> {
    if (push.kind === "multiEq") {
        return (table.where as (arg: Record<string, unknown>) => Collection<T>)(push.fields);
    }

    const clause = (table.where as (field: string) => DexieWhereClause<T>)(push.field);

    switch (push.kind) {
        case "anyOf":
            return clause.anyOf(push.values);
        case "eq":
            return clause.equals(push.value);
        case "gt":
            return clause.above(push.value);
        case "lt":
            return clause.below(push.value);
        case "gte":
            return clause.aboveOrEqual(push.value);
        case "lte":
            return clause.belowOrEqual(push.value);
        case "ne":
            return clause.notEqual(push.value);
        case "startsWith":
            return clause.startsWith(push.prefix);
        case "between":
            return clause.between(push.lower, push.upper, push.includeLower, push.includeUpper);
    }
}

interface DexieWhereClause<T> {
    anyOf(values: unknown[]): Collection<T>;
    equals(value: unknown): Collection<T>;
    above(value: unknown): Collection<T>;
    below(value: unknown): Collection<T>;
    aboveOrEqual(value: unknown): Collection<T>;
    belowOrEqual(value: unknown): Collection<T>;
    notEqual(value: unknown): Collection<T>;
    startsWith(prefix: string): Collection<T>;
    between(lower: unknown, upper: unknown, includeLower?: boolean, includeUpper?: boolean): Collection<T>;
}

// ============================================================================
// Residual Selector Building
// ============================================================================

/**
 * Build residual selector from conditions, removing the pushed parts.
 */
function buildResidualSelector(conditions: MangoSelector[], push: Pushdown): MangoSelector {
    const residualConditions: MangoSelector[] = [];

    for (let i = 0; i < conditions.length; i++) {
        const cleaned = cleanCondition(conditions[i], push);
        if (cleaned !== null) {
            // Check if non-empty
            let hasKeys = false;
            for (const _ in cleaned) {
                hasKeys = true;
                break;
            }
            if (hasKeys) {
                residualConditions.push(cleaned);
            }
        }
    }

    if (residualConditions.length === 0) {
        return {};
    }

    if (residualConditions.length === 1) {
        return residualConditions[0];
    }

    return { $and: residualConditions };
}

/**
 * Clean a single condition by removing pushed parts.
 */
function cleanCondition(cond: MangoSelector, push: Pushdown): MangoSelector | null {
    // Get first key without creating array
    let field: string | null = null;
    let keyCount = 0;
    for (const k in cond) {
        if (keyCount === 0) field = k;
        keyCount++;
        if (keyCount > 1) break;
    }

    if (keyCount !== 1 || field === null) return cond;

    // Combination operators pass through unchanged
    if (COMBINATION_OPERATORS.has(field)) {
        return cond;
    }

    const criteria = (cond as Record<string, unknown>)[field];

    // Handle multiEq pushdown
    if (push.kind === "multiEq") {
        if (!(field in push.fields)) return cond;
        const val = push.fields[field];

        if (typeof criteria === "string" || typeof criteria === "number") {
            return criteria === val ? null : cond;
        }

        if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
            const critObj = criteria as Record<string, unknown>;
            if (critObj.$eq === val) {
                // Check if $eq is the only key
                let otherKeys = false;
                for (const k in critObj) {
                    if (k !== "$eq") {
                        otherKeys = true;
                        break;
                    }
                }
                if (!otherKeys) return null;
                // Copy without $eq
                const copy: Record<string, unknown> = {};
                for (const k in critObj) {
                    if (k !== "$eq") copy[k] = critObj[k];
                }
                return { [field]: copy };
            }
        }

        return cond;
    }

    // For single-field pushdowns, only clean if field matches
    if (push.field !== field) {
        return cond;
    }

    // Clean based on pushdown kind
    switch (push.kind) {
        case "eq": {
            if (typeof criteria === "string" || typeof criteria === "number") {
                return criteria === push.value ? null : cond;
            }
            if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
                return removeOperatorFromCriteria(field, criteria as Record<string, unknown>, "$eq", push.value);
            }
            return cond;
        }

        case "ne":
        case "gt":
        case "lt":
        case "gte":
        case "lte": {
            if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
                const opKey = OP_TO_MANGO[push.kind];
                return removeOperatorFromCriteria(field, criteria as Record<string, unknown>, opKey, push.value);
            }
            return cond;
        }

        case "anyOf": {
            if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
                return removeOperatorFromCriteria(field, criteria as Record<string, unknown>, "$in", undefined);
            }
            return cond;
        }

        case "startsWith": {
            if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
                return removeOperatorFromCriteria(field, criteria as Record<string, unknown>, "$beginsWith", undefined);
            }
            return cond;
        }

        case "between": {
            if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
                const critObj = criteria as Record<string, unknown>;
                const copy: Record<string, unknown> = {};
                let hasRemaining = false;

                for (const k in critObj) {
                    let shouldRemove = false;
                    if (push.includeLower && k === "$gte" && critObj[k] === push.lower) shouldRemove = true;
                    if (!push.includeLower && k === "$gt" && critObj[k] === push.lower) shouldRemove = true;
                    if (push.includeUpper && k === "$lte" && critObj[k] === push.upper) shouldRemove = true;
                    if (!push.includeUpper && k === "$lt" && critObj[k] === push.upper) shouldRemove = true;

                    if (!shouldRemove) {
                        copy[k] = critObj[k];
                        hasRemaining = true;
                    }
                }

                return hasRemaining ? { [field]: copy } : null;
            }
            return cond;
        }

        default:
            return cond;
    }
}

/**
 * Helper to remove a single operator from criteria object.
 * Returns null if nothing remains, or a new condition object.
 */
function removeOperatorFromCriteria(
    field: string,
    critObj: Record<string, unknown>,
    opKey: string,
    expectedValue: unknown,
): MangoSelector | null {
    // Check if we should remove (value match or undefined means always remove)
    if (expectedValue !== undefined && critObj[opKey] !== expectedValue) {
        return { [field]: critObj };
    }

    // Check if opKey is the only key
    let hasOther = false;
    for (const k in critObj) {
        if (k !== opKey) {
            hasOther = true;
            break;
        }
    }

    if (!hasOther) return null;

    // Copy without the operator
    const copy: Record<string, unknown> = {};
    for (const k in critObj) {
        if (k !== opKey) copy[k] = critObj[k];
    }
    return { [field]: copy };
}
