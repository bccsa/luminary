import type { Collection, Table } from "dexie";
import type { MongoQuery, MongoSelector } from "./MongoTypes";
import { mongoCompile } from "./mongoCompile";

type Pushdown =
    | { kind: "anyOf"; field: string; values: any[] }
    | { kind: "eq" | "gt" | "lt" | "gte" | "lte" | "ne"; field: string; value: any }
    | { kind: "multiEq"; fields: Record<string, string | number> };

// No options needed; Dexie warns at runtime if orderBy/where fields are not indexed.

/**
 * Convert a Mongo-like query into a Dexie Collection, pushing index-friendly parts into Dexie.
 *
 * Flow:
 * 1) If $sort is specified, prefer Table.orderBy(index) (+ .reverse for desc) and perform all filtering in-memory
 *    using Collection.filter(mongoCompile(selector)).
 * 2) Without $sort, extract index-friendly predicates from the selector and push it into Table.where().
 *    Remaining selector conditions are compiled via mongoCompile and applied with Collection.filter().
 * 3) If $in is available for the chosen field, prefer where().anyOf(values) over other comparators.
 */
export function mongoToDexie<T>(table: Table<T>, query: MongoQuery): Collection<T> {
    const selector: MongoSelector = (query?.selector || {}) as MongoSelector;
    const limit = typeof query?.$limit === "number" ? query.$limit : undefined;
    const sort = Array.isArray(query?.$sort) ? query.$sort : undefined;

    // 1) Sorting path: prefer using orderBy on an indexed field, then filter in-memory.
    if (sort && sort.length > 0) {
        const entry = sort[0];
        const sortField = Object.keys(entry)[0];
        const desc = (entry as any)[sortField] === "desc"; // eslint-disable-line @typescript-eslint/no-explicit-any

        // Try orderBy; if it fails (non-indexed), fall back to table.filter
        let col: Collection<T>;
        try {
            col = table.orderBy(sortField);
            if (desc) col = col.reverse();
        } catch {
            // Fallback to an un-ordered collection filtered in-memory
            col = table.filter(() => true);
        }

        const pred = mongoCompile(selector) as (d: T) => boolean;
        col = col.filter(pred);
        if (typeof limit === "number") return col.limit(Math.max(0, limit));
        return col;
    }

    // 2) No sorting: push down index-friendly predicates into where(), then filter residual.
    const push = extractPushdown(selector);
    if (push) {
        let col = applyWhere(table, push);
        const residual = buildResidualSelector(selector, push);
        if (!isEmptySelector(residual)) {
            const pred = mongoCompile(residual) as (d: T) => boolean;
            col = col.filter(pred);
        }
        if (typeof limit === "number") return col.limit(Math.max(0, limit));
        return col;
    }

    // 3) Fallback: in-memory filter for full selector
    const pred = mongoCompile(selector) as (d: T) => boolean;
    const base = table.filter(pred);
    if (typeof limit === "number") return base.limit(Math.max(0, limit));
    return base;
}

function isEmptySelector(q: MongoSelector): boolean {
    return Object.keys(q).length === 0;
}

function extractPushdown(q: MongoSelector): Pushdown | undefined {
    // 1) Prefer maximum number of equality comparators (top-level and within $and), excluding booleans
    const eqMap = collectMultiEq(q);
    if (eqMap && Object.keys(eqMap).length > 0) {
        return { kind: "multiEq", fields: eqMap };
    }

    // 2) Next prefer $in -> anyOf on any single field (search both top-level and $and)
    const anyOf = findAnyOf(q);
    if (anyOf) return anyOf;

    // 3) Finally pick a single-field comparator pushdown (gt/lt/gte/lte/eq/ne) if available
    return findSingleComparator(q);
}

function singleFieldPushdownFromSelector(q: MongoSelector): Pushdown | undefined {
    const keys = Object.keys(q);
    if (keys.length !== 1) return undefined;
    const field = keys[0];
    if (field === "$or" || field === "$and") return undefined;

    const criteria = (q as any)[field]; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Primitive equality (skip booleans)
    if (typeof criteria === "string" || typeof criteria === "number") {
        return { kind: "eq", field, value: criteria };
    }
    if (typeof criteria === "boolean") return undefined; // never push booleans

    // Comparison object
    if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
        if (Array.isArray((criteria as any).$in)) {
            const values = (criteria as any).$in as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
            // Avoid boolean-only arrays
            if (values.length > 0 && !values.every((v) => typeof v === "boolean")) {
                return { kind: "anyOf", field, values };
            }
        }
        for (const op of ["$eq", "$gt", "$lt", "$gte", "$lte", "$ne"]) {
            if (op in criteria) {
                const value = (criteria as any)[op]; // eslint-disable-line @typescript-eslint/no-explicit-any
                switch (op) {
                    case "$eq":
                        if (typeof value === "string" || typeof value === "number")
                            return { kind: "eq", field, value };
                        break;
                    case "$gt":
                        if (typeof value === "number") return { kind: "gt", field, value };
                        break;
                    case "$lt":
                        if (typeof value === "number") return { kind: "lt", field, value };
                        break;
                    case "$gte":
                        if (typeof value === "number") return { kind: "gte", field, value };
                        break;
                    case "$lte":
                        if (typeof value === "number") return { kind: "lte", field, value };
                        break;
                    case "$ne":
                        if (typeof value !== "boolean") return { kind: "ne", field, value };
                        break;
                }
            }
        }
    }
    return undefined;
}

function findAnyOf(q: MongoSelector): Pushdown | undefined {
    // Check top-level fields for $in
    for (const key of Object.keys(q)) {
        if (key === "$and" || key === "$or") continue;
        const crit: any = (q as any)[key]; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (crit && typeof crit === "object" && !Array.isArray(crit)) {
            const values = (crit as any).$in as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (
                Array.isArray(values) &&
                values.length > 0 &&
                !values.every((v) => typeof v === "boolean")
            ) {
                return { kind: "anyOf", field: key, values };
            }
        }
    }
    // Check $and subs
    if (Array.isArray(q.$and)) {
        for (const sub of q.$and) {
            const s = singleFieldPushdownFromSelector(sub);
            if (s && s.kind === "anyOf") return s;
        }
    }
    return undefined;
}

function findSingleComparator(q: MongoSelector): Pushdown | undefined {
    // Try top-level fields for a comparator
    for (const key of Object.keys(q)) {
        if (key === "$and" || key === "$or") continue;
        const criteria: any = (q as any)[key]; // eslint-disable-line @typescript-eslint/no-explicit-any
        // Primitive equality (skip booleans)
        if (typeof criteria === "string" || typeof criteria === "number") {
            return { kind: "eq", field: key, value: criteria };
        }
        if (typeof criteria === "boolean") continue;
        if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
            // Prefer $eq if present (should be rare here because multiEq would have consumed eqs)
            if (Object.prototype.hasOwnProperty.call(criteria, "$eq")) {
                const v = criteria.$eq;
                if (typeof v === "string" || typeof v === "number") {
                    return { kind: "eq", field: key, value: v };
                }
            }
            const order = ["$gt", "$lt", "$gte", "$lte", "$ne"] as const;
            for (const op of order) {
                if (Object.prototype.hasOwnProperty.call(criteria, op)) {
                    const v = (criteria as any)[op]; // eslint-disable-line @typescript-eslint/no-explicit-any
                    if (
                        (op === "$ne" && typeof v !== "boolean") ||
                        (op !== "$ne" && typeof v === "number")
                    ) {
                        switch (op) {
                            case "$gt":
                                return { kind: "gt", field: key, value: v };
                            case "$lt":
                                return { kind: "lt", field: key, value: v };
                            case "$gte":
                                return { kind: "gte", field: key, value: v };
                            case "$lte":
                                return { kind: "lte", field: key, value: v };
                            case "$ne":
                                return { kind: "ne", field: key, value: v };
                        }
                    }
                }
            }
        }
    }
    // Try $and subs
    if (Array.isArray(q.$and)) {
        for (const sub of q.$and) {
            const s = singleFieldPushdownFromSelector(sub);
            if (s && s.kind !== "anyOf") return s;
        }
    }
    return undefined;
}

function buildResidualSelector(q: MongoSelector, push: Pushdown): MongoSelector {
    // Deep-ish clone to avoid mutating original
    const clone = (): any => JSON.parse(JSON.stringify(q)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const res: any = clone(); // eslint-disable-line @typescript-eslint/no-explicit-any

    const removeTopLevelForField = (field: string, predicate: (crit: any) => any | null) => {
        if (res[field] === undefined) return;
        const crit = res[field];
        if (crit === undefined) return;
        if (typeof crit === "string" || typeof crit === "number" || typeof crit === "boolean") {
            const next = predicate(crit);
            if (next === null) delete res[field];
            else res[field] = next;
        } else if (crit && typeof crit === "object" && !Array.isArray(crit)) {
            const next = predicate(crit);
            if (next === null) delete res[field];
            else res[field] = next;
        }
    };

    const cleanAndArray = () => {
        if (!Array.isArray(res.$and)) return;
        const out: any[] = [];
        for (const sub of res.$and) {
            const cleaned = cleanSub(sub);
            if (cleaned && Object.keys(cleaned).length > 0) out.push(cleaned);
        }
        if (out.length === 0) delete res.$and;
        else res.$and = out;
    };

    const cleanSub = (sub: any): any => {
        // eslint-disable-line @typescript-eslint/no-explicit-any
        // Remove pushed conditions from a single-field sub
        const keys = Object.keys(sub);
        if (keys.length !== 1) return sub;
        const field = keys[0];
        const crit = sub[field];

        if (push.kind === "multiEq") {
            if (!(field in push.fields)) return sub;
            const val = push.fields[field];
            if (typeof crit === "string" || typeof crit === "number") {
                if (crit === val) return {};
                return sub;
            }
            if (crit && typeof crit === "object") {
                const copy = { ...crit };
                if (copy.$eq === val) delete copy.$eq;
                if (Object.keys(copy).length === 0) return {};
                return { [field]: copy };
            }
            return sub;
        }

        if ((push as any).field !== field) return sub; // eslint-disable-line @typescript-eslint/no-explicit-any

        const removeOp = (op: string, expected: any) => {
            // eslint-disable-line @typescript-eslint/no-explicit-any
            if (typeof crit === "string" || typeof crit === "number" || typeof crit === "boolean") {
                if (op === "eq" && crit === expected) return {};
                return sub;
            }
            if (crit && typeof crit === "object") {
                const copy = { ...crit };
                const map: Record<string, string> = {
                    eq: "$eq",
                    ne: "$ne",
                    gt: "$gt",
                    lt: "$lt",
                    gte: "$gte",
                    lte: "$lte",
                };
                const k = map[op];
                if (k && copy[k] === expected) delete copy[k];
                if (Object.keys(copy).length === 0) return {};
                return { [field]: copy };
            }
            return sub;
        };

        switch (push.kind) {
            case "eq":
                return removeOp("eq", (push as any).value);
            case "ne":
                return removeOp("ne", (push as any).value);
            case "gt":
                return removeOp("gt", (push as any).value);
            case "lt":
                return removeOp("lt", (push as any).value);
            case "gte":
                return removeOp("gte", (push as any).value);
            case "lte":
                return removeOp("lte", (push as any).value);
            case "anyOf":
                // Remove $in if it matches values; otherwise leave as-is
                if (crit && typeof crit === "object" && Array.isArray((crit as any).$in)) {
                    // eslint-disable-line @typescript-eslint/no-explicit-any
                    const copy = { ...crit };
                    delete copy.$in;
                    if (Object.keys(copy).length === 0) return {};
                    return { [field]: copy };
                }
                return sub;
        }
    };

    // Clean top-level fields
    if (push.kind === "multiEq") {
        for (const f of Object.keys(push.fields)) {
            const val = push.fields[f];
            removeTopLevelForField(f, (crit) => {
                if (typeof crit === "string" || typeof crit === "number") {
                    return crit === val ? null : crit;
                }
                if (crit && typeof crit === "object") {
                    const copy = { ...crit };
                    if (copy.$eq === val) delete copy.$eq;
                    return Object.keys(copy).length === 0 ? null : copy;
                }
                return crit;
            });
        }
    } else {
        const field = (push as any).field as string; // eslint-disable-line @typescript-eslint/no-explicit-any
        const value = (push as any).value; // eslint-disable-line @typescript-eslint/no-explicit-any
        removeTopLevelForField(field, (crit) => {
            switch (push.kind) {
                case "eq":
                    if (typeof crit === "string" || typeof crit === "number")
                        return crit === value ? null : crit;
                    if (crit && typeof crit === "object") {
                        const copy = { ...crit };
                        if (copy.$eq === value) delete copy.$eq;
                        return Object.keys(copy).length === 0 ? null : copy;
                    }
                    return crit;
                case "ne": {
                    if (crit && typeof crit === "object") {
                        const copy = { ...crit };
                        if (copy.$ne === value) delete copy.$ne;
                        return Object.keys(copy).length === 0 ? null : copy;
                    }
                    return crit;
                }
                case "gt":
                case "lt":
                case "gte":
                case "lte": {
                    if (crit && typeof crit === "object") {
                        const copy = { ...crit };
                        const map: Record<string, string> = {
                            gt: "$gt",
                            lt: "$lt",
                            gte: "$gte",
                            lte: "$lte",
                        };
                        const k = map[push.kind];
                        if (k && copy[k] === value) delete copy[k];
                        return Object.keys(copy).length === 0 ? null : copy;
                    }
                    return crit;
                }
                case "anyOf": {
                    if (crit && typeof crit === "object" && Array.isArray((crit as any).$in)) {
                        // eslint-disable-line @typescript-eslint/no-explicit-any
                        const copy = { ...crit };
                        delete copy.$in;
                        return Object.keys(copy).length === 0 ? null : copy;
                    }
                    return crit;
                }
            }
        });
    }

    // Clean $and subs
    cleanAndArray();

    // If selector becomes empty, return {}
    const keys = Object.keys(res).filter(
        (k) => !(k === "$and" && Array.isArray(res.$and) && res.$and.length === 0),
    );
    if (keys.length === 0) return {} as MongoSelector;
    return res as MongoSelector;
}

// (no-op) matchesPushdown helper removed; residual subtraction handles correctness

function applyWhere<T>(table: Table<T>, push: Pushdown): Collection<T> {
    if (push.kind === "multiEq") {
        // Dexie supports where(queryObject) for compound index matching; booleans are not included here by construction
        return (table.where as any)(push.fields); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    const clause = (table.where as any)((push as any).field); // eslint-disable-line @typescript-eslint/no-explicit-any
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
    }
}

// Collect simple (non-boolean) equality conditions from top-level and top-level $and
function collectMultiEq(q: MongoSelector): Record<string, string | number> {
    const out: Record<string, string | number> = {};

    const consider = (field: string, crit: any): void => {
        if (typeof crit === "string" || typeof crit === "number") {
            if (out[field] !== undefined && out[field] !== crit) {
                // conflict -> make unsatisfiable by clearing all (skip pushdown)
                Object.keys(out).forEach((k) => delete out[k]);
                return;
            }
            out[field] = crit;
        } else if (crit && typeof crit === "object" && !Array.isArray(crit)) {
            const eqVal = (crit as any).$eq; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (typeof eqVal === "string" || typeof eqVal === "number") {
                if (out[field] !== undefined && out[field] !== eqVal) {
                    Object.keys(out).forEach((k) => delete out[k]);
                    return;
                }
                out[field] = eqVal;
            }
        }
    };

    // Top-level fields
    for (const k of Object.keys(q)) {
        if (k === "$and" || k === "$or") continue;
        const crit = (q as any)[k]; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (typeof crit === "boolean") continue; // do not index booleans
        consider(k, crit);
    }

    // $and: include single-field simple selectors
    if (Array.isArray(q.$and)) {
        for (const sub of q.$and) {
            const keys = Object.keys(sub);
            if (keys.length !== 1) continue;
            const f = keys[0];
            if (f === "$and" || f === "$or") continue;
            const crit = (sub as any)[f]; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (typeof crit === "boolean") continue;
            consider(f, crit);
        }
    }

    return out;
}
