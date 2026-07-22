import { DbQueryResult } from "../db/db.service";
import { MongoComparisonCriteria, MongoSelectorDto } from "../dto/MongoSelectorDto";
import { MongoQueryDto } from "../dto/MongoQueryDto";

/**
 * Run `fn` over `items` with at most `concurrency` calls in flight at once, preserving
 * result order. Used to bound CouchDB load during a parentId fan-out.
 */
export async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;

    async function worker(): Promise<void> {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i]);
        }
    }

    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
}

export function findParentIdIn(and: MongoSelectorDto[]): MongoComparisonCriteria | undefined {
    for (const condition of and) {
        const value = condition.parentId;
        if (value && typeof value === "object" && !Array.isArray(value) && "$in" in value) {
            return value as MongoComparisonCriteria;
        }
    }
    return undefined;
}

export function applySortAndLimit(
    docs: any[],
    sort: MongoQueryDto["sort"],
    limit: number | undefined,
): any[] {
    let result = docs;
    if (sort?.length) {
        const [field, direction] = Object.entries(sort[0] || {})[0] || [];
        if (field) {
            const desc = direction === "desc";
            result = docs.slice().sort((a, b) => {
                const av = a?.[field];
                const bv = b?.[field];
                let cmp = 0;
                if (av == null && bv != null) cmp = -1;
                else if (av != null && bv == null) cmp = 1;
                else if (av < bv) cmp = -1;
                else if (av > bv) cmp = 1;
                if (desc) cmp = -cmp;
                if (cmp !== 0) return cmp;
                return String(a?._id ?? "").localeCompare(String(b?._id ?? ""));
            });
        }
    }
    return typeof limit === "number" ? result.slice(0, Math.max(0, limit)) : result;
}

export function setBlockRange(result: DbQueryResult): void {
    const times = result.docs
        .map((doc) => doc?.updatedTimeUtc)
        .filter((value): value is number => typeof value === "number");
    result.blockStart = times.length ? Math.max(...times) : 0;
    result.blockEnd = times.length ? Math.min(...times) : 0;
}
