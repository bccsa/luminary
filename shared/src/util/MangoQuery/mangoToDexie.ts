import type { Collection, Table } from "dexie";
import type { MangoQuery, MangoSelector } from "./MangoTypes";
import { mangoCompile } from "./mangoCompile";
import { expandMangoSelector } from "./expandMangoQuery";
import { normalizeSelector, generateTemplateKey, isPlaceholder } from "./templateNormalize";
import { compileTemplateSelector, type ParameterizedPredicate } from "./compileTemplateSelector";
import {
    cacheGet,
    cacheSet,
    clearCacheByPrefix,
    getCacheStats,
    CACHE_PREFIX_EXPAND,
    CACHE_PREFIX_TEMPLATE_DEXIE,
} from "./queryCache";

// ============================================================================
// Types
// ============================================================================

/**
 * Pushdown strategy with value indices for parameterized execution.
 * Values are stored as indices into the values array.
 */
type TemplatePushdown =
    | { kind: "anyOf"; field: string; valuesIdx: number }
    | { kind: "eq" | "gt" | "lt" | "gte" | "lte" | "ne"; field: string; valueIdx: number }
    | { kind: "startsWith"; field: string; prefixIdx: number }
    | {
          kind: "between";
          field: string;
          lowerIdx: number;
          upperIdx: number;
          includeLower: boolean;
          includeUpper: boolean;
      }
    | { kind: "multiEq"; fieldIndices: Record<string, number> };

/** Cached result of template query analysis */
interface AnalyzedTemplate {
    push: TemplatePushdown | undefined;
    residualTemplate: MangoSelector;
    residualPredicate: ParameterizedPredicate | null;
}

// ============================================================================
// Module-level Constants
// ============================================================================

const COMBINATION_OPERATORS = new Set(["$and", "$or", "$not", "$nor"]);

// ============================================================================
// Cache Management Exports
// ============================================================================

/**
 * Clear all cached Dexie query analysis results.
 * Does not affect mangoCompile cache.
 */
export function clearDexieCache(): void {
    clearCacheByPrefix(CACHE_PREFIX_EXPAND);
    clearCacheByPrefix(CACHE_PREFIX_TEMPLATE_DEXIE);
}

/**
 * Get cache statistics for mangoToDexie.
 */
export function getDexieCacheStats(): {
    analysis: { size: number; keys: string[] };
    expanded: { size: number; keys: string[] };
} {
    return {
        analysis: getCacheStats(CACHE_PREFIX_TEMPLATE_DEXIE),
        expanded: getCacheStats(CACHE_PREFIX_EXPAND),
    };
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Convert a Mango query into a Dexie Collection, pushing index-friendly parts into Dexie.
 *
 * Uses template-based caching: the query structure is normalized, and the analysis
 * (pushdown strategy and residual selector) is cached based on the structure alone.
 * This allows queries with the same structure but different values to share the
 * same analysis, with values applied at runtime.
 *
 * Supported pushdown operators:
 * - `$eq` / primitive equality → `where(field).equals(value)` or `where({ f1: v1, ... })`
 * - `$ne` → `where(field).notEqual(value)`
 * - `$gt` / `$lt` / `$gte` / `$lte` → `above` / `below` / `aboveOrEqual` / `belowOrEqual`
 * - Combined `$gte` + `$lte` on same field → `where(field).between(lower, upper)`
 * - `$in` → `where(field).anyOf(values)`
 * - `$beginsWith` → `where(field).startsWith(prefix)`
 *
 * All other operators are handled in-memory via the residual filter.
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
            col = table.filter(() => true);
        }

        const pred = mangoCompile(selector) as (d: T) => boolean;
        col = col.filter(pred);
        if (typeof limit === "number") return col.limit(Math.max(0, limit));
        return col;
    }

    // 2) No sorting: use template-based cached analysis
    // Normalize the selector to extract values
    const { template, values } = normalizeSelector(selector);

    // Get or compute the analysis for this template
    const analysis = analyzeTemplate(template);

    if (analysis.push) {
        // Apply the pushdown with actual values
        let col = applyTemplateWhere(table, analysis.push, values);

        // Apply residual filter if needed
        if (analysis.residualPredicate) {
            col = col.filter((doc) => analysis.residualPredicate!(doc, values));
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
// Template Analysis (Cached)
// ============================================================================

/**
 * Analyze a template selector to extract pushdown strategy and residual.
 * Results are cached for repeated queries with the same structure.
 */
function analyzeTemplate(template: MangoSelector): AnalyzedTemplate {
    const cacheKey = generateTemplateKey(template, CACHE_PREFIX_TEMPLATE_DEXIE);

    const cached = cacheGet<AnalyzedTemplate>(cacheKey);
    if (cached) {
        return cached;
    }

    // Expand the template to $and form for analysis
    const expanded = expandMangoSelector(template);
    const andConditions = expanded.$and || [];

    // Extract pushdown strategy from template
    const push = extractTemplatePushdown(andConditions);

    // Build residual template (parts not handled by pushdown)
    let residualTemplate: MangoSelector;
    let residualPredicate: ParameterizedPredicate | null = null;

    if (push) {
        residualTemplate = buildResidualTemplate(andConditions, push);
        if (!isEmptySelector(residualTemplate)) {
            residualPredicate = compileTemplateSelector(residualTemplate);
        }
    } else {
        residualTemplate = template;
        residualPredicate = compileTemplateSelector(template);
    }

    const result: AnalyzedTemplate = {
        push,
        residualTemplate,
        residualPredicate,
    };

    cacheSet(cacheKey, result);
    return result;
}

// ============================================================================
// Template Pushdown Extraction
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

/** Collected pushdown data from template analysis */
interface CollectedTemplatePushdownData {
    /** Equality fields with their value indices */
    eqMap: Record<string, number>;
    /** First $beginsWith found */
    startsWith: { field: string; prefixIdx: number } | null;
    /** Range bounds by field */
    rangeMap: Record<
        string,
        { gteIdx?: number; lteIdx?: number; gtIdx?: number; ltIdx?: number }
    >;
    /** First $in found */
    anyOf: { field: string; valuesIdx: number } | null;
    /** First single comparator found */
    singleComparator: TemplatePushdown | null;
}

/**
 * Extract pushdown strategy from template conditions.
 * Uses placeholder indices instead of actual values.
 * Note: Static boolean values in templates are skipped for pushdown
 * (Dexie's where() doesn't work well with boolean indexes).
 */
function extractTemplatePushdown(conditions: MangoSelector[]): TemplatePushdown | undefined {
    const data: CollectedTemplatePushdownData = {
        eqMap: {},
        startsWith: null,
        rangeMap: {},
        anyOf: null,
        singleComparator: null,
    };

    let eqConflict = false;

    for (let i = 0; i < conditions.length; i++) {
        const cond = conditions[i];

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

        // Skip static boolean values - they're kept in template but not pushed to Dexie
        if (typeof criteria === "boolean") {
            continue;
        }

        // Check for placeholder (direct field equality)
        if (isPlaceholder(criteria)) {
            const idx = criteria.$__idx;
            if (!eqConflict) {
                if (data.eqMap[field] !== undefined && data.eqMap[field] !== idx) {
                    eqConflict = true;
                    data.eqMap = {};
                } else {
                    data.eqMap[field] = idx;
                }
            }
            if (!data.singleComparator) {
                data.singleComparator = { kind: "eq", field, valueIdx: idx };
            }
            continue;
        }

        // Object criteria with operators
        if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
            const critObj = criteria as Record<string, unknown>;

            // Check $eq
            const eqVal = critObj.$eq;
            if (isPlaceholder(eqVal)) {
                const idx = eqVal.$__idx;
                if (!eqConflict) {
                    if (data.eqMap[field] !== undefined && data.eqMap[field] !== idx) {
                        eqConflict = true;
                        data.eqMap = {};
                    } else {
                        data.eqMap[field] = idx;
                    }
                }
                if (!data.singleComparator) {
                    data.singleComparator = { kind: "eq", field, valueIdx: idx };
                }
            }

            // Check $beginsWith
            const prefix = critObj.$beginsWith;
            if (!data.startsWith && isPlaceholder(prefix)) {
                data.startsWith = { field, prefixIdx: prefix.$__idx };
            }

            // Check range operators
            const gteVal = critObj.$gte;
            const lteVal = critObj.$lte;
            const gtVal = critObj.$gt;
            const ltVal = critObj.$lt;

            if (
                isPlaceholder(gteVal) ||
                isPlaceholder(lteVal) ||
                isPlaceholder(gtVal) ||
                isPlaceholder(ltVal)
            ) {
                if (!data.rangeMap[field]) data.rangeMap[field] = {};
                if (isPlaceholder(gteVal)) data.rangeMap[field].gteIdx = gteVal.$__idx;
                if (isPlaceholder(lteVal)) data.rangeMap[field].lteIdx = lteVal.$__idx;
                if (isPlaceholder(gtVal)) data.rangeMap[field].gtIdx = gtVal.$__idx;
                if (isPlaceholder(ltVal)) data.rangeMap[field].ltIdx = ltVal.$__idx;
            }

            // Check $in
            const inVal = critObj.$in;
            if (!data.anyOf && isPlaceholder(inVal)) {
                data.anyOf = { field, valuesIdx: inVal.$__idx };
            }

            // Check single comparators
            if (!data.singleComparator) {
                if (isPlaceholder(gtVal)) {
                    data.singleComparator = { kind: "gt", field, valueIdx: gtVal.$__idx };
                } else if (isPlaceholder(ltVal)) {
                    data.singleComparator = { kind: "lt", field, valueIdx: ltVal.$__idx };
                } else if (isPlaceholder(gteVal)) {
                    data.singleComparator = { kind: "gte", field, valueIdx: gteVal.$__idx };
                } else if (isPlaceholder(lteVal)) {
                    data.singleComparator = { kind: "lte", field, valueIdx: lteVal.$__idx };
                } else if (isPlaceholder(critObj.$ne)) {
                    data.singleComparator = {
                        kind: "ne",
                        field,
                        valueIdx: (critObj.$ne as { $__idx: number }).$__idx,
                    };
                }
            }
        }
    }

    // Priority 1: multiEq - check without Object.keys() allocation
    let hasEqFields = false;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _key in data.eqMap) {
        hasEqFields = true;
        break;
    }
    if (hasEqFields) {
        return { kind: "multiEq", fieldIndices: data.eqMap };
    }

    // Priority 2: startsWith
    if (data.startsWith) {
        return {
            kind: "startsWith",
            field: data.startsWith.field,
            prefixIdx: data.startsWith.prefixIdx,
        };
    }

    // Priority 3: between
    for (const field in data.rangeMap) {
        const range = data.rangeMap[field];
        const hasLower = range.gteIdx !== undefined || range.gtIdx !== undefined;
        const hasUpper = range.lteIdx !== undefined || range.ltIdx !== undefined;

        if (hasLower && hasUpper) {
            const lowerIdx = range.gteIdx !== undefined ? range.gteIdx : range.gtIdx!;
            const upperIdx = range.lteIdx !== undefined ? range.lteIdx : range.ltIdx!;
            const includeLower = range.gteIdx !== undefined;
            const includeUpper = range.lteIdx !== undefined;
            return { kind: "between", field, lowerIdx, upperIdx, includeLower, includeUpper };
        }
    }

    // Priority 4: anyOf
    if (data.anyOf) {
        return { kind: "anyOf", field: data.anyOf.field, valuesIdx: data.anyOf.valuesIdx };
    }

    // Priority 5: single comparator
    return data.singleComparator || undefined;
}

// ============================================================================
// Where Application with Values
// ============================================================================

function applyTemplateWhere<T>(
    table: Table<T>,
    push: TemplatePushdown,
    values: unknown[],
): Collection<T> {
    if (push.kind === "multiEq") {
        // Build the where object from field indices and actual values
        const whereObj: Record<string, unknown> = {};
        for (const field in push.fieldIndices) {
            whereObj[field] = values[push.fieldIndices[field]];
        }
        return (table.where as (arg: Record<string, unknown>) => Collection<T>)(whereObj);
    }

    const clause = (table.where as (field: string) => DexieWhereClause<T>)(push.field);

    switch (push.kind) {
        case "anyOf":
            return clause.anyOf(values[push.valuesIdx] as unknown[]);
        case "eq":
            return clause.equals(values[push.valueIdx]);
        case "gt":
            return clause.above(values[push.valueIdx]);
        case "lt":
            return clause.below(values[push.valueIdx]);
        case "gte":
            return clause.aboveOrEqual(values[push.valueIdx]);
        case "lte":
            return clause.belowOrEqual(values[push.valueIdx]);
        case "ne":
            return clause.notEqual(values[push.valueIdx]);
        case "startsWith":
            return clause.startsWith(values[push.prefixIdx] as string);
        case "between":
            return clause.between(
                values[push.lowerIdx],
                values[push.upperIdx],
                push.includeLower,
                push.includeUpper,
            );
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
    between(
        lower: unknown,
        upper: unknown,
        includeLower?: boolean,
        includeUpper?: boolean,
    ): Collection<T>;
}

// ============================================================================
// Residual Template Building
// ============================================================================

/**
 * Build residual template from conditions, removing the pushed parts.
 */
function buildResidualTemplate(
    conditions: MangoSelector[],
    push: TemplatePushdown,
): MangoSelector {
    const residualConditions: MangoSelector[] = [];

    for (let i = 0; i < conditions.length; i++) {
        const cleaned = cleanTemplateCondition(conditions[i], push);
        if (cleaned !== null) {
            // Check for non-empty without Object.keys() allocation
            let hasKeys = false;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for (const _key in cleaned) {
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
function cleanTemplateCondition(
    cond: MangoSelector,
    push: TemplatePushdown,
): MangoSelector | null {
    let field: string | null = null;
    let keyCount = 0;
    for (const k in cond) {
        if (keyCount === 0) field = k;
        keyCount++;
        if (keyCount > 1) break;
    }

    if (keyCount !== 1 || field === null) return cond;
    if (COMBINATION_OPERATORS.has(field)) return cond;

    const criteria = (cond as Record<string, unknown>)[field];

    // Handle multiEq pushdown
    if (push.kind === "multiEq") {
        if (!(field in push.fieldIndices)) return cond;
        const expectedIdx = push.fieldIndices[field];

        // Direct placeholder
        if (isPlaceholder(criteria) && criteria.$__idx === expectedIdx) {
            return null;
        }

        // $eq operator
        if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
            const critObj = criteria as Record<string, unknown>;
            const eqVal = critObj.$eq;
            if (isPlaceholder(eqVal) && eqVal.$__idx === expectedIdx) {
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

    switch (push.kind) {
        case "eq": {
            if (isPlaceholder(criteria) && criteria.$__idx === push.valueIdx) {
                return null;
            }
            if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
                const critObj = criteria as Record<string, unknown>;
                const eqVal = critObj.$eq;
                if (isPlaceholder(eqVal) && eqVal.$__idx === push.valueIdx) {
                    return removeOperatorFromCriteria(field, critObj, "$eq");
                }
            }
            return cond;
        }

        case "ne":
        case "gt":
        case "lt":
        case "gte":
        case "lte": {
            if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
                const critObj = criteria as Record<string, unknown>;
                const opKey =
                    push.kind === "ne"
                        ? "$ne"
                        : push.kind === "gt"
                          ? "$gt"
                          : push.kind === "lt"
                            ? "$lt"
                            : push.kind === "gte"
                              ? "$gte"
                              : "$lte";
                const opVal = critObj[opKey];
                if (isPlaceholder(opVal) && opVal.$__idx === push.valueIdx) {
                    return removeOperatorFromCriteria(field, critObj, opKey);
                }
            }
            return cond;
        }

        case "anyOf": {
            if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
                const critObj = criteria as Record<string, unknown>;
                const inVal = critObj.$in;
                if (isPlaceholder(inVal) && inVal.$__idx === push.valuesIdx) {
                    return removeOperatorFromCriteria(field, critObj, "$in");
                }
            }
            return cond;
        }

        case "startsWith": {
            if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
                const critObj = criteria as Record<string, unknown>;
                const bwVal = critObj.$beginsWith;
                if (isPlaceholder(bwVal) && bwVal.$__idx === push.prefixIdx) {
                    return removeOperatorFromCriteria(field, critObj, "$beginsWith");
                }
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

                    if (push.includeLower && k === "$gte") {
                        const v = critObj[k];
                        if (isPlaceholder(v) && v.$__idx === push.lowerIdx) shouldRemove = true;
                    }
                    if (!push.includeLower && k === "$gt") {
                        const v = critObj[k];
                        if (isPlaceholder(v) && v.$__idx === push.lowerIdx) shouldRemove = true;
                    }
                    if (push.includeUpper && k === "$lte") {
                        const v = critObj[k];
                        if (isPlaceholder(v) && v.$__idx === push.upperIdx) shouldRemove = true;
                    }
                    if (!push.includeUpper && k === "$lt") {
                        const v = critObj[k];
                        if (isPlaceholder(v) && v.$__idx === push.upperIdx) shouldRemove = true;
                    }

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
 */
function removeOperatorFromCriteria(
    field: string,
    critObj: Record<string, unknown>,
    opKey: string,
): MangoSelector | null {
    let hasOther = false;
    for (const k in critObj) {
        if (k !== opKey) {
            hasOther = true;
            break;
        }
    }

    if (!hasOther) return null;

    const copy: Record<string, unknown> = {};
    for (const k in critObj) {
        if (k !== opKey) copy[k] = critObj[k];
    }
    return { [field]: copy };
}
