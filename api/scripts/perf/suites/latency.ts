import { CatalogueEntry } from "../catalogue";
import { PerfConfig } from "../lib/config";
import { ApiClient, ServerTrace } from "../lib/http";
import { distribution, Distribution, mean } from "../lib/stats";

export type LatencyResult = {
    entry: CatalogueEntry;
    status: number;
    /** Every sample's status matched the first one. */
    stable: boolean;
    /** 403 on an entry that was not expected to be rejected: the identity lacks access, not a slow path. */
    permissionBlocked: boolean;
    error?: string;
    /** End-to-end, measured by the audit client. */
    client: Distribution;
    /** The API's own view of the request, from the X-Perf-Trace header. */
    server?: Distribution;
    /** Mean ms per traced phase. */
    spans: Record<string, number>;
    /** Mean CouchDB round trips and wait per request. */
    db?: { find: number; get: number; view: number; write: number; other: number; ms: number };
    bytes: number;
    /** Brotli-compressed size of the same body (locally computed estimate of the wire cost). */
    wireBytes: number;
    meta: Record<string, unknown>;
};

/**
 * Time every catalogue entry. Warm-up samples are discarded so CouchDB view builds and
 * JIT warm-up don't land in the reported percentiles.
 */
export async function runLatencySuite(
    api: ApiClient,
    entries: CatalogueEntry[],
    config: PerfConfig,
    onProgress?: (entry: CatalogueEntry, index: number, total: number) => void,
): Promise<LatencyResult[]> {
    const results: LatencyResult[] = [];

    for (const [index, entry] of entries.entries()) {
        onProgress?.(entry, index, entries.length);

        for (let i = 0; i < config.warmup; i++) await fire(api, entry);

        const clientMs: number[] = [];
        const serverMs: number[] = [];
        const traces: ServerTrace[] = [];
        const statuses = new Set<number>();
        let bytes = 0;
        let wireBytes = 0;
        let error: string | undefined;

        for (let i = 0; i < config.samples; i++) {
            const res = await fire(api, entry);
            statuses.add(res.status);
            clientMs.push(res.ms);
            bytes = Math.max(bytes, res.bytes);
            wireBytes = Math.max(wireBytes, res.wireBytes);
            if (res.trace) {
                traces.push(res.trace);
                serverMs.push(res.trace.t);
            }
            if (!res.ok && !error) error = res.error;
        }

        const status = [...statuses][0] ?? 0;
        const permissionBlocked = entry.expectStatus === undefined && status === 403;
        const unexpected =
            entry.expectStatus !== undefined
                ? status !== entry.expectStatus
                : !permissionBlocked && (status < 200 || status >= 300);

        results.push({
            entry,
            status,
            stable: statuses.size === 1,
            permissionBlocked,
            error: unexpected ? error ?? `unexpected status ${status}` : undefined,
            client: distribution(clientMs),
            server: serverMs.length ? distribution(serverMs) : undefined,
            spans: meanSpans(traces),
            db: meanDb(traces),
            bytes,
            wireBytes,
            meta: traces[traces.length - 1]?.m ?? {},
        });
    }

    return results;
}

async function fire(api: ApiClient, entry: CatalogueEntry) {
    return entry.method === "GET" ? api.get(entry.path) : api.post(entry.path, entry.body);
}

function meanSpans(traces: ServerTrace[]): Record<string, number> {
    const names = new Set(traces.flatMap((t) => Object.keys(t.s ?? {})));
    const out: Record<string, number> = {};
    for (const name of names) out[name] = mean(traces.map((t) => t.s?.[name] ?? 0));
    return out;
}

function meanDb(traces: ServerTrace[]): LatencyResult["db"] | undefined {
    if (!traces.length) return undefined;
    const keys = ["find", "get", "view", "write", "other", "ms"] as const;
    const out: any = {};
    for (const key of keys) out[key] = mean(traces.map((t) => t.db?.[key] ?? 0));
    return out;
}
