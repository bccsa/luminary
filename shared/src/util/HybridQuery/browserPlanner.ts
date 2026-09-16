/** The browser's local-first routing rule, as a plan the session executes. */
import { DocType, type BaseDocumentDto } from "../../types";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import type { QueryCoverage, QueryPlan } from "./contracts";
import { decideContentApiQuery, readType } from "./queryPlanner";

/**
 * Routes by the query's top-level type:
 * - `content` is partially synced, so the local read is supplemented from the API.
 * - a type present in `syncList` is fully synced, so the local read is complete.
 * - anything else has no local copy and is read from the API only.
 *
 * The last two re-route when sync membership flips; a typeless query stays API-only.
 */
export function planBrowserQuery<T extends BaseDocumentDto>(
    query: MangoQuery,
    coverage: QueryCoverage,
): QueryPlan<T> {
    const type = readType(query);

    if (type === DocType.Content) {
        return {
            useLocal: true,
            type: DocType.Content,
            remote: (local, _covered, held) =>
                decideContentApiQuery(query, local, coverage.cutoff(), held),
        };
    }

    if (coverage.isSynced(type)) {
        return { useLocal: true, type, watchMembership: true };
    }

    return {
        useLocal: false,
        type,
        remote: () => query,
        joinRooms: true,
        watchMembership: true,
    };
}
