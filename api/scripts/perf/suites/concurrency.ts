import { CatalogueEntry } from "../catalogue";
import { PerfConfig } from "../lib/config";
import { ApiClient } from "../lib/http";
import { distribution, r } from "../lib/stats";

export type ConcurrencyRow = {
    id: string;
    label: string;
    concurrency: number;
    requests: number;
    errors: number;
    throughput: number;
    p50: number;
    p95: number;
    max: number;
    /** Mean of (client ms − server handler ms): time the request spent waiting to be handled. */
    queueMs: number;
    serverP95: number;
    dbMs: number;
};

/**
 * Latency against offered load. The gap between what the client measures and what the API's
 * own trace reports is time the request spent queued before Fastify handled it — that gap
 * growing with concurrency is the signal that the event loop, not CouchDB, is the limit.
 */
export async function runConcurrencySuite(
    api: ApiClient,
    entries: CatalogueEntry[],
    config: PerfConfig,
    onProgress?: (label: string, concurrency: number) => void,
): Promise<ConcurrencyRow[]> {
    const targets = pickTargets(entries);
    const rows: ConcurrencyRow[] = [];

    for (const entry of targets) {
        for (const concurrency of config.concurrency) {
            onProgress?.(entry.label, concurrency);

            const clientMs: number[] = [];
            const serverMs: number[] = [];
            const dbMs: number[] = [];
            const queue: number[] = [];
            let errors = 0;

            const total = config.concurrencyRequests;
            let issued = 0;
            const started = performance.now();

            const worker = async () => {
                while (issued < total) {
                    issued++;
                    const res =
                        entry.method === "GET"
                            ? await api.get(entry.path)
                            : await api.post(entry.path, entry.body);
                    const expected = entry.expectStatus ?? 200;
                    if (res.status !== expected) errors++;
                    clientMs.push(res.ms);
                    if (res.trace) {
                        serverMs.push(res.trace.t);
                        dbMs.push(res.trace.db?.ms ?? 0);
                        queue.push(Math.max(0, res.ms - res.trace.t));
                    }
                }
            };

            await Promise.all(Array.from({ length: concurrency }, worker));
            const elapsedSec = (performance.now() - started) / 1000;

            const client = distribution(clientMs);
            rows.push({
                id: entry.id,
                label: entry.label,
                concurrency,
                requests: total,
                errors,
                throughput: r(total / elapsedSec),
                p50: client.p50,
                p95: client.p95,
                max: client.max,
                queueMs: distribution(queue).mean,
                serverP95: distribution(serverMs).p95,
                dbMs: distribution(dbMs).mean,
            });
        }
    }

    return rows;
}

/**
 * A representative slice rather than the whole catalogue: the heaviest sync page, a typical
 * read-path feed, a search, and the guard-only endpoint that isolates auth cost from query cost.
 */
function pickTargets(entries: CatalogueEntry[]): CatalogueEntry[] {
    const ids = [
        "sync-content-post-first",
        "sync-content-post",
        "hybrid-publishDate-window",
        "hybrid-by-slug",
        "fts-common",
        "protected",
    ];
    return ids.map((id) => entries.find((e) => e.id === id)).filter(Boolean) as CatalogueEntry[];
}
