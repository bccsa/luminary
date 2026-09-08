import { DbQueryResult } from "../db/db.service";
import { MongoQueryDto } from "../dto/MongoQueryDto";
import { MongoSelectorDto } from "../dto/MongoSelectorDto";

/**
 * CouchDB Mango cannot seek the primary index for `_id: { $in: [...] }` — it always
 * falls back to a partition scan (measured: ~2.4k docs examined for 25 results).
 * A per-id `_id: { $eq }` query is a direct document lookup, so fanning the list out
 * into one query each and merging is dramatically cheaper. Mirrors the parentId
 * fan-out shape; the permission/status/language filters ride along on each sub-query
 * unchanged, so CouchDB still enforces them.
 */

/** Above this the request storm outweighs the saved scan — fall back to the single query. */
export const MAX_ID_FANOUT = 100;

/** Cap concurrent CouchDB round trips so one request can't open one socket per id. */
export const ID_FANOUT_CONCURRENCY = 20;

/**
 * Locate a top-level `{ _id: { $in: [...strings] } }` clause in an expanded `$and`.
 * Returns the clause (for identity replacement) and its string ids, or `undefined`
 * when the selector isn't a plain id-list shape.
 */
export function findIdInList(
    and: MongoSelectorDto[] | undefined,
): { clause: MongoSelectorDto; ids: string[] } | undefined {
    for (const clause of and ?? []) {
        const criteria = (clause as Record<string, unknown>)._id;
        if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) continue;
        if (Object.keys(clause).length !== 1) continue;
        const $in = (criteria as Record<string, unknown>).$in;
        if (!Array.isArray($in) || $in.length === 0) continue;
        if (!$in.every((v) => typeof v === "string")) continue;
        return { clause, ids: [...new Set($in as string[])] };
    }
    return undefined;
}

async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            out[i] = await fn(items[i]);
        }
    });
    await Promise.all(workers);
    return out;
}

function blockRange(docs: { updatedTimeUtc?: number }[]): { blockStart: number; blockEnd: number } {
    if (!docs.length) return { blockStart: 0, blockEnd: 0 };
    const times = docs.map((d) => d.updatedTimeUtc ?? 0);
    return { blockStart: Math.max(...times), blockEnd: Math.min(...times) };
}

/**
 * Fan a located id-list into per-id equality queries, run them with bounded
 * concurrency, and merge. Sort (when present on the original query) and limit are
 * re-applied to the merged set. `execFind` is `DbService.executeFindQuery`.
 */
export async function runIdListFanout(
    query: MongoQueryDto,
    hit: { clause: MongoSelectorDto; ids: string[] },
    execFind: (q: MongoQueryDto) => Promise<DbQueryResult>,
): Promise<DbQueryResult> {
    const results = await mapWithConcurrency(hit.ids, ID_FANOUT_CONCURRENCY, (id) => {
        // Drop any `use_index` from the original — a per-id `_id` equality is served by
        // the primary / `type-id` index and a stale pin would just be rejected.
        const sub = { ...query, selector: undefined, use_index: undefined } as any;
        delete sub.use_index;
        sub.selector = {
            $and: (query.selector.$and ?? []).map((c) =>
                c === hit.clause ? { _id: { $eq: id } } : c,
            ),
        };
        return execFind(sub);
    });

    const seen = new Set<string>();
    let docs = results
        .flatMap((r) => r.docs ?? [])
        .filter((d: any) => !seen.has(d._id) && (seen.add(d._id), true));

    const sort = (query as any).sort as Record<string, "asc" | "desc">[] | undefined;
    if (Array.isArray(sort) && sort.length) {
        const [field, dir] = Object.entries(sort[0])[0];
        docs = [...docs].sort((a: any, b: any) =>
            a[field] === b[field] ? 0 : (a[field] < b[field] ? -1 : 1) * (dir === "desc" ? -1 : 1),
        );
    }
    if (typeof query.limit === "number") docs = docs.slice(0, query.limit);

    const stat = (key: string) =>
        results.reduce((sum, r) => sum + ((r.execution_stats as any)?.[key] ?? 0), 0);

    return {
        docs,
        execution_stats: {
            total_keys_examined: stat("total_keys_examined"),
            total_docs_examined: stat("total_docs_examined"),
            execution_time_ms: stat("execution_time_ms"),
            results_returned: docs.length,
        },
        ...blockRange(docs),
    } as DbQueryResult;
}
