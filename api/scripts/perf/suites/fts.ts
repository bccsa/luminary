import { CatalogueEntry } from "../catalogue";
import { ApiClient } from "../lib/http";
import { r } from "../lib/stats";

export type FtsStageRow = {
    id: string;
    label: string;
    status: number;
    totalMs: number;
    searchMs: number;
    dbMs: number;
    viewCalls: number;
    /** Trigrams generated from the query string. */
    trigrams: number;
    /** Trigrams surviving high-df pruning — these drive the candidate scan. */
    keptTrigrams: number;
    estimatedCandidateRows: number;
    candidateRows: number;
    /** Candidates left after permission and visibility filtering. */
    survivors: number;
    topK: number;
    results: number;
    bytes: number;
    /** The candidate scan hit its row budget, so ranking worked from a truncated set. */
    budgetBound: boolean;
};

/**
 * Break each search into its pipeline stages. `/fts` is the one endpoint whose cost is
 * driven by the query text rather than the corpus alone: trigram count, how many survive
 * pruning, and how many candidate rows those pull are what separate a fast search from a
 * slow one.
 */
export async function runFtsSuite(
    api: ApiClient,
    entries: CatalogueEntry[],
): Promise<FtsStageRow[]> {
    const rows: FtsStageRow[] = [];

    for (const entry of entries.filter((e) => e.group === "fts")) {
        // One warm-up: the corpus-stats view result is cached with a TTL, and a cold read
        // would otherwise be charged to whichever search happened to run first.
        await api.post(entry.path, entry.body);

        const res = await api.post<any[]>(entry.path, entry.body, true);
        const meta = (res.trace?.m ?? {}) as Record<string, number | boolean>;

        rows.push({
            id: entry.id,
            label: entry.label,
            status: res.status,
            totalMs: r(res.trace?.t ?? res.ms),
            searchMs: r(res.trace?.s?.search ?? 0),
            dbMs: r(res.trace?.db?.ms ?? 0),
            viewCalls: res.trace?.db?.view ?? 0,
            trigrams: num(meta.trigrams),
            keptTrigrams: num(meta.keptTrigrams),
            estimatedCandidateRows: num(meta.estimatedCandidateRows),
            candidateRows: num(meta.candidateRows),
            survivors: num(meta.survivors),
            topK: num(meta.topK),
            results: num(meta.results),
            bytes: res.bytes,
            budgetBound:
                num(meta.candidateRows) >= num(meta.candidateRowBudget) &&
                num(meta.candidateRowBudget) > 0,
        });
    }

    return rows;
}

function num(value: unknown): number {
    return typeof value === "number" ? value : 0;
}
