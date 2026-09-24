import { db } from "../../db/database";
import type { HttpReq } from "../../api/http";
import { config } from "../../config";
import type { BaseDocumentDto } from "../../types";
import { mangoToDexie } from "../MangoQuery/mangoToDexie";
import type { MangoQuery } from "../MangoQuery/MangoTypes";

export const DEFAULT_REMOTE_QUERY_LIMIT = 500;
let httpService: HttpReq<any> | undefined;
export function initHybridQuery(http: HttpReq<any>): void {
    httpService = http;
}
export function resetQueryTransport(): void {
    httpService = undefined;
}

export async function queryRemote<T = unknown>(query: MangoQuery): Promise<T[]> {
    if (!httpService) {
        throw new Error(
            "hybridQuery module not initialized with HTTP service. Call initHybridQuery(http) first.",
        );
    }

    const payload: Record<string, unknown> = {
        selector: query.selector,
        // Callers outside the app's live queries override this so their load is separable in
        // the API's expensive-query logs.
        identifier: query.identifier ?? "hybridQuery",
        limit: Math.min(
            typeof query.$limit === "number" ? query.$limit : DEFAULT_REMOTE_QUERY_LIMIT,
            DEFAULT_REMOTE_QUERY_LIMIT,
        ),
    };
    // Match the consumer's scope: CMS reads (config.cms) are CmsView-gated server-side and include
    // drafts/expired; app reads stay View-gated + published-only. The remote supplement otherwise
    // defaulted to View while CMS sync used CmsView — an inconsistent window. No cms flag ⇒ cms:false,
    // so omit it when false (wire payload unchanged for non-CMS consumers).
    if (config?.cms === true) payload.cms = true;
    if (Array.isArray(query.$sort)) payload.sort = query.$sort;
    // Forward the client-chosen index hint to the API (validated against an
    // allowlist there). Same pattern as sync/syncBatch.ts — index selection
    // is a client concern.
    if (typeof query.use_index === "string") payload.use_index = query.use_index;
    // Opt-in only: without it the API filters expired Content out of the response, hiding
    // exactly the docs a caller watching for expiry crossings needs to see.
    if (query.includeExpired === true) payload.includeExpired = true;

    const res = await httpService.post("query", payload as any);
    return (res?.docs ?? []) as T[];
}

/**
 * One-shot read against the **local IndexedDB document cache** (`db.docs`) — the local
 * counterpart to {@link queryRemote}. Resolves the matching documents (possibly empty)
 * and **never touches the API**: the imperative counterpart to the reactive
 * {@link useHybridQuery} / {@link HybridQuery}, for boot-time, event-handler, or other
 * non-Vue code where the reactive output (change-gated: an empty result never emits)
 * cannot be awaited.
 *
 * Local-only by design. Callers that need the below-cutoff API supplement should use
 * {@link queryRemote} (or a reactive HybridQuery).
 */
export function queryLocal<T extends BaseDocumentDto = BaseDocumentDto>(
    query: MangoQuery,
): Promise<T[]> {
    return mangoToDexie<T>(db.docs, query);
}
