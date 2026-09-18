import { CatalogueEntry } from "../catalogue";
import { PerfConfig } from "../lib/config";
import { ApiClient, Timed } from "../lib/http";
import { distribution, Distribution } from "../lib/stats";

export type FtsStageRow = {
    id: string;
    label: string;
    status: number;
    /** Timed samples behind the distributions below. */
    samples: number;
    /** Median server-side total, so findings and tables can read a single number. */
    totalMs: number;
    /** Spread of the server-side total. A single sample cannot show run-to-run noise. */
    total: Distribution;
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
 *
 * Timings are sampled like the latency suite's, because a single measurement carries no
 * spread — and comparing corpus sizes means comparing distributions, not one number each.
 */
export async function runFtsSuite(
    api: ApiClient,
    entries: CatalogueEntry[],
    config: PerfConfig,
): Promise<FtsStageRow[]> {
    const rows: FtsStageRow[] = [];
    const warmup = Math.max(1, config.warmup);
    const samples = Math.max(1, config.samples);

    for (const entry of entries.filter((e) => e.group === "fts")) {
        // At least one warm-up: the corpus-stats view result is cached with a TTL, and a cold
        // read would otherwise be charged to whichever search happened to run first.
        for (let i = 0; i < warmup; i++) await api.post(entry.path, entry.body);

        const totalMs: number[] = [];
        const searchMs: number[] = [];
        const dbMs: number[] = [];
        let bytes = 0;
        let last: Timed<any[]> | undefined;

        for (let i = 0; i < samples; i++) {
            const res = await api.post<any[]>(entry.path, entry.body, true);
            totalMs.push(res.trace?.t ?? res.ms);
            searchMs.push(res.trace?.s?.search ?? 0);
            dbMs.push(res.trace?.db?.ms ?? 0);
            bytes = Math.max(bytes, res.bytes);
            last = res;
        }

        // Stage counters are a property of the query and the corpus rather than of the sample,
        // so the last response speaks for all of them.
        const meta = (last?.trace?.m ?? {}) as Record<string, number | boolean>;
        const total = distribution(totalMs);

        rows.push({
            id: entry.id,
            label: entry.label,
            status: last?.status ?? 0,
            samples: total.n,
            totalMs: total.p50,
            total,
            searchMs: distribution(searchMs).p50,
            dbMs: distribution(dbMs).p50,
            viewCalls: last?.trace?.db?.view ?? 0,
            trigrams: num(meta.trigrams),
            keptTrigrams: num(meta.keptTrigrams),
            estimatedCandidateRows: num(meta.estimatedCandidateRows),
            candidateRows: num(meta.candidateRows),
            survivors: num(meta.survivors),
            topK: num(meta.topK),
            results: num(meta.results),
            bytes,
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
