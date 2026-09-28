/** Pagination rules. Pure — the session supplies the query and the loaded window. */
import type { BaseDocumentDto } from "../../types";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import type { QueryPagination } from "./contracts";

/**
 * Grow the window by widening `$limit`, which keeps each slice's query cumulative
 * as the contract requires.
 *
 * Reports exhaustion when the settled window under-fills its limit: no source could
 * supply enough rows, so asking for more returns nothing new. A query with no
 * `$limit` is already unbounded and never extends.
 */
export function paginateByLimit<T extends BaseDocumentDto>(pageSize: number): QueryPagination<T> {
    return {
        next(query: MangoQuery, loaded: readonly T[]): MangoQuery | undefined {
            const limit = query.$limit;
            if (typeof limit !== "number" || pageSize <= 0) return undefined;
            if (loaded.length < limit) return undefined;
            return { ...query, $limit: limit + pageSize };
        },
    };
}
