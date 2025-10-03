import { Collection, Table } from "dexie";
import { MRDocument, MRQuery } from "./MongoTypes";
import { mongoToDexieFilter } from "./MongoToDexieFilter";

type Pushdown = { field: string; op: "eq" | "gt" | "lt" | "gte" | "lte" | "ne"; value: any };

export interface MongoToDexieOptions {
    /** List of indexed fields to prefer for pushdown into where() */
    indexedFields?: string[];
}

/**
 * Translates a Mongo-like query into a Dexie query/collection chain with optional index pushdown.
 */
export function mongoToDexieQuery<T extends MRDocument>(
    table: Table<T>,
    query: MRQuery,
    options?: MongoToDexieOptions,
): Collection<T> {
    const q = (query || {}) as MRQuery;
    const limit = typeof q.$limit === "number" ? q.$limit : undefined;
    const sort = Array.isArray(q.$sort) ? q.$sort : undefined;
    const { $limit: _omitL, $sort: _omitS, ...qCore } = q as any; // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    const push = extractPushdown(qCore, options?.indexedFields);

    let col: Collection<T>;
    if (push) {
        col = applyWhere(table, push);
        const residual = buildResidualQuery(qCore, push);
        if (!isEmptyQuery(residual)) {
            const pred = mongoToDexieFilter(residual);
            col = col.and(pred as (obj: T) => boolean);
        }
    } else {
        const pred = mongoToDexieFilter(qCore) as (obj: T) => boolean;
        col = table.filter(pred);
    }

    // Sorting: Mango-style $sort array of { field: 'asc'|'desc' }
    if (sort && sort.length > 0) {
        if (sort.length === 1) {
            const entry = sort[0];
            const field = Object.keys(entry)[0];
            const desc = (entry as any)[field] === "desc"; // eslint-disable-line @typescript-eslint/no-explicit-any
            col = table.orderBy(field);
            if (desc) col = col.reverse();
        } else {
            // Multi-field sort not supported in-chain; caller can sort after toArray().
        }
    }

    if (typeof limit === "number") {
        if (limit <= 0) {
            return col.limit(0);
        }
        return col.limit(limit);
    }

    return col;
}

function isEmptyQuery(q: MRQuery): boolean {
    return Object.keys(q).length === 0;
}

function extractPushdown(q: MRQuery, indexed?: string[]): Pushdown | undefined {
    // If $and is present, choose the first matching single-field condition
    if (Array.isArray(q.$and) && q.$and.length > 0) {
        for (const sub of q.$and) {
            const pd = singleFieldPushdown(sub, indexed);
            if (pd) return pd;
        }
        return undefined;
    }
    // Otherwise try single-field query
    return singleFieldPushdown(q, indexed);
}

function singleFieldPushdown(q: MRQuery, indexed?: string[]): Pushdown | undefined {
    const keys = Object.keys(q);
    if (keys.length !== 1) return undefined;
    const field = keys[0];
    if (field === "$or" || field === "$and") return undefined;
    if (indexed && !indexed.includes(field)) {
        // Skip if the user specified index list and this field isn't indexed
        return undefined;
    }
    const criteria = (q as any)[field]; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (
        typeof criteria === "string" ||
        typeof criteria === "number" ||
        typeof criteria === "boolean"
    ) {
        return { field, op: "eq", value: criteria };
    }
    if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
        const ops = Object.keys(criteria);
        if (ops.length === 1 && ops[0].startsWith("$")) {
            const op = ops[0];
            const value = (criteria as any)[op]; // eslint-disable-line @typescript-eslint/no-explicit-any
            switch (op) {
                case "$gt":
                    if (typeof value === "number") return { field, op: "gt", value };
                    break;
                case "$lt":
                    if (typeof value === "number") return { field, op: "lt", value };
                    break;
                case "$gte":
                    if (typeof value === "number") return { field, op: "gte", value };
                    break;
                case "$lte":
                    if (typeof value === "number") return { field, op: "lte", value };
                    break;
                case "$ne":
                    if (
                        typeof value === "number" ||
                        typeof value === "string" ||
                        typeof value === "boolean"
                    )
                        return { field, op: "ne", value };
                    break;
            }
        }
    }
    return undefined;
}

function buildResidualQuery(q: MRQuery, push: Pushdown): MRQuery {
    // If q is $and, remove the first subquery matching the pushdown
    if (Array.isArray(q.$and) && q.$and.length > 0) {
        const remaining = q.$and.filter((sub) => !matchesPushdown(sub, push));
        if (remaining.length === 0) return {} as MRQuery;
        if (remaining.length === 1) return remaining[0];
        return { $and: remaining } as MRQuery;
    }
    // If q is the single-field pushdown itself, residual is empty
    if (matchesPushdown(q, push)) return {} as MRQuery;
    // otherwise, keep q (rare), let fallback handle
    return q;
}

function matchesPushdown(q: MRQuery, push: Pushdown): boolean {
    const keys = Object.keys(q);
    if (keys.length !== 1) return false;
    const field = keys[0];
    if (field !== push.field) return false;
    const criteria = (q as any)[field]; // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (push.op) {
        case "eq":
            return criteria === push.value;
        case "ne":
            return criteria && typeof criteria === "object" && criteria.$ne === push.value;
        case "gt":
            return criteria && typeof criteria === "object" && criteria.$gt === push.value;
        case "lt":
            return criteria && typeof criteria === "object" && criteria.$lt === push.value;
        case "gte":
            return criteria && typeof criteria === "object" && criteria.$gte === push.value;
        case "lte":
            return criteria && typeof criteria === "object" && criteria.$lte === push.value;
    }
}

function applyWhere<T>(table: Table<T>, push: Pushdown): Collection<T> {
    const clause = table.where(push.field);
    switch (push.op) {
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
