import type { MangoSelector } from "./MangoTypes";

/** Compile a Mango query into a filter function */
export function mangoCompile(q: MangoSelector): (doc: any) => boolean {
    // Handle invalid query
    if (q === null || typeof q !== "object") {
        // Non-object query is unsupported, always returns false
        return () => false;
    }

    // Handle empty query
    const keys = Object.keys(q);
    if (keys.length === 0) {
        // Empty query matches all
        return () => true;
    }

    const andPredicates: Array<(doc: any) => boolean> = [];

    keys.forEach((key) => {
        if (key === "$or") {
            const arr = q.$or;
            if (!Array.isArray(arr)) throw new Error("$or must be an array of query objects");
            const subs = arr.map(mangoCompile);
            andPredicates.push((doc) => subs.some((fn) => fn(doc)));
            return;
        }

        if (key === "$and") {
            const arr = q.$and;
            if (!Array.isArray(arr)) throw new Error("$and must be an array of query objects");
            const subs = arr.map(mangoCompile);
            andPredicates.push((doc) => subs.every((fn) => fn(doc)));
            return;
        }

        // non-explicit field equality (e.g. { city: "NYC" })
        const criteria = (q as any)[key]; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (
            typeof criteria === "string" ||
            typeof criteria === "number" ||
            typeof criteria === "boolean"
        ) {
            andPredicates.push((doc) => doc && doc[key] === criteria);
            return;
        }

        // Field comparison object (e.g. { score: { $gt: 10 } })
        if (typeof criteria === "object" && criteria !== null && !Array.isArray(criteria)) {
            const ops = Object.keys(criteria);
            ops.forEach((op) => {
                const val = (criteria as any)[op]; // eslint-disable-line @typescript-eslint/no-explicit-any

                // Equal
                if (op === "$eq") {
                    andPredicates.push((doc) => doc && doc[key] === val);
                    return;
                }

                // Not equal
                if (op === "$ne") {
                    andPredicates.push((doc) => doc && doc[key] !== val);
                    return;
                }

                // Greater than
                if (op === "$gt") {
                    if (typeof val !== "number") {
                        andPredicates.push(() => false);
                        return;
                    }
                    andPredicates.push(
                        (doc) => doc && typeof doc[key] === "number" && doc[key] > val,
                    );
                    return;
                }

                // Less than
                if (op === "$lt") {
                    if (typeof val !== "number") {
                        andPredicates.push(() => false);
                        return;
                    }
                    andPredicates.push(
                        (doc) => doc && typeof doc[key] === "number" && doc[key] < val,
                    );
                    return;
                }

                // Greater than or equal
                if (op === "$gte") {
                    if (typeof val !== "number") {
                        andPredicates.push(() => false);
                        return;
                    }
                    andPredicates.push(
                        (doc) => doc && typeof doc[key] === "number" && doc[key] >= val,
                    );
                    return;
                }

                // Less than or equal
                if (op === "$lte") {
                    if (typeof val !== "number") {
                        andPredicates.push(() => false);
                        return;
                    }
                    andPredicates.push(
                        (doc) => doc && typeof doc[key] === "number" && doc[key] <= val,
                    );
                    return;
                }

                // In array
                if (op === "$in") {
                    if (!Array.isArray(val)) {
                        andPredicates.push(() => false);
                        return;
                    }
                    andPredicates.push((doc) => doc && val.includes(doc[key]));
                    return;
                }

                // Unsupported operator
                andPredicates.push(() => false);
            });
            return;
        }

        // Unsupported criteria type
        andPredicates.push(() => false);
    });

    return (doc) => andPredicates.every((pred) => pred(doc));
}
