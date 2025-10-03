import { MRDocument, MRQuery } from "./MongoTypes";

/**
 * Build a Dexie/IndexedDB-compatible filter predicate from a Mongo-like query.
 *
 * Supported subset:
 * - Empty query => always true
 * - Equality: { field: value }
 * - Comparison: { field: { $gt|$lt|$gte|$lte|$ne: number } }
 * - Logical OR: { $or: [ q1, q2, ... ] }
 * - Logical AND: { $and: [ q1, q2, ... ] }
 *
 * Usage with Dexie:
 *   const predicate = mongoToDexieFilter(query);
 *   const result = await db.table.filter(predicate).toArray();
 */
export function mongoToDexieFilter(query: MRQuery): (doc: MRDocument) => boolean {
    // Compile recursively into a predicate function
    const compile = (q: MRQuery): ((doc: MRDocument) => boolean) => {
        const keys = Object.keys(q);

        // Empty => always true
        if (keys.length === 0) {
            return () => true;
        }

        // Logical operators
        if (q.$or) {
            const arr = q.$or;
            if (!Array.isArray(arr)) throw new Error("$or must be an array of query objects");
            const subs = arr.map(compile);
            return (doc) => subs.some((fn) => fn(doc));
        }
        if (q.$and) {
            const arr = q.$and;
            if (!Array.isArray(arr)) throw new Error("$and must be an array of query objects");
            const subs = arr.map(compile);
            return (doc) => subs.every((fn) => fn(doc));
        }

        // For this minimal subset, assume single-field query is the norm
        if (keys.length === 1) {
            const field = keys[0];
            const criteria = q[field] as unknown;

            // Comparison object
            if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
                const ops = Object.keys(criteria as Record<string, unknown>);
                if (ops.length === 1 && ops[0].startsWith("$")) {
                    const op = ops[0] as "$gt" | "$lt" | "$gte" | "$lte" | "$ne";
                    const val = (criteria as Record<string, unknown>)[op];
                    if (typeof val !== "number") return () => false; // only numeric comparisons supported
                    const cmp: Record<typeof op, (a: number, b: number) => boolean> = {
                        $gt: (a, b) => a > b,
                        $lt: (a, b) => a < b,
                        $gte: (a, b) => a >= b,
                        $lte: (a, b) => a <= b,
                        $ne: (a, b) => a !== b,
                    } as const;
                    return (doc) =>
                        typeof (doc as any)[field] === "number" &&
                        cmp[op]((doc as any)[field], val); // eslint-disable-line @typescript-eslint/no-explicit-any
                }
            }

            // Equality primitive
            if (
                typeof criteria === "string" ||
                typeof criteria === "number" ||
                typeof criteria === "boolean"
            ) {
                return (doc) => (doc as any)[field] === criteria; // eslint-disable-line @typescript-eslint/no-explicit-any
            }
        }

        // Unsupported => always false
        return () => false;
    };

    return compile(query || ({} as MRQuery));
}

export type DexiePredicate = (doc: MRDocument) => boolean;
