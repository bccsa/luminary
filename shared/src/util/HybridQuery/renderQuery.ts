/** Composition entry point for one-shot query resolution outside a reactive UI. */
import type { BaseDocumentDto } from "../../types";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import type { QueryCapabilities, QueryPlan } from "./contracts";
import type { HybridQueryOptions } from "./options";
import { QuerySession } from "./querySession";

/**
 * Plan for a local source that is authoritative wherever it has coverage: a covered
 * empty result is a real answer and must not fall back to the remote source. An
 * uncovered read — the source holds nothing for this query at all — goes remote.
 *
 * `localCanAnswer` is the caller's declaration that the query is answerable from the
 * local source's domain. When false the plan is remote-only.
 */
export function planCoveredQuery<T extends BaseDocumentDto>(
    query: MangoQuery,
    localCanAnswer: boolean,
): QueryPlan<T> {
    if (!localCanAnswer) return { useLocal: false, remote: () => query };
    return { useLocal: true, remote: (_local, covered) => (covered ? undefined : query) };
}

/**
 * Run one query to completion and resolve the window it settles on. Rejects rather
 * than resolving empty when a source fails, so a caller that must not publish a
 * partial result can treat failure as failure.
 *
 * Executes through the same {@link QuerySession} as the reactive facade, so routing,
 * merge order and cache writing cannot drift between environments.
 */
export function resolveQueryOnce<T extends BaseDocumentDto>(
    query: MangoQuery,
    capabilities: QueryCapabilities<T>,
    options: Omit<HybridQueryOptions, "live" | "keepPreviousResult"> = {},
): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
        let docs: T[] = [];
        let settled = false;
        const finish = (deliver: () => void) => {
            if (settled) return;
            settled = true;
            // Disposal is deferred: the session is mid-notification on this stack.
            queueMicrotask(() => session.dispose());
            deliver();
        };
        const session = new QuerySession<T>(
            () => query,
            { ...options, live: false },
            capabilities,
            {
                publish: (published) => {
                    docs = published;
                },
                pending: ({ local, remote }) => {
                    if (!local && !remote) finish(() => resolve(docs));
                },
                error: (error) => {
                    if (error !== undefined) finish(() => reject(error));
                },
            },
        );
        session.rebuild(query);
    });
}
