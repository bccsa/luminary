import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

export type PerfConfig = {
    /** Base URL of the running API. */
    baseUrl: string;
    /** CouchDB root URL (with credentials) and database name, for direct `_explain` / index reads. */
    couchUrl: string;
    couchDb: string;
    /** Optional bearer token + provider id. Without these the audit runs as the anonymous identity. */
    token?: string;
    providerId?: string;
    /** Repetitions per catalogue entry in the latency suite. */
    samples: number;
    /** Discarded warm-up repetitions before sampling (CouchDB view/index warm-up). */
    warmup: number;
    /** Concurrency levels for the load suite. */
    concurrency: number[];
    /** Requests issued per concurrency level. */
    concurrencyRequests: number;
    /** Directory the JSON + Markdown reports are written to. */
    outDir: string;
    /** Suites to run. */
    suites: string[];
    apiVersion: string;
};

const ALL_SUITES = ["indexes", "explain", "latency", "fts", "concurrency", "socket"];

export function loadConfig(argv: string[]): PerfConfig {
    const flags = parseFlags(argv);

    const couchUrl = (flags.couch ?? process.env.DB_CONNECTION_STRING ?? "http://localhost:5984")
        .toString()
        .replace(/\/+$/, "");

    const requested = flags.suites
        ? String(flags.suites)
              .split(",")
              .map((s) => s.trim())
        : ALL_SUITES;
    const unknown = requested.filter((s) => !ALL_SUITES.includes(s));
    if (unknown.length) {
        throw new Error(`Unknown suite(s): ${unknown.join(", ")}. Known: ${ALL_SUITES.join(", ")}`);
    }

    return {
        baseUrl: (
            flags.url ??
            process.env.PERF_BASE_URL ??
            `http://localhost:${process.env.PORT ?? 3000}`
        )
            .toString()
            .replace(/\/+$/, ""),
        couchUrl,
        couchDb: (
            flags.db ??
            process.env.PERF_DB ??
            process.env.DB_DATABASE ??
            "luminary"
        ).toString(),
        token: (flags.token ?? process.env.PERF_AUTH_TOKEN) as string | undefined,
        providerId: (flags.provider ?? process.env.PERF_AUTH_PROVIDER_ID) as string | undefined,
        samples: num(flags.samples, 15),
        warmup: num(flags.warmup, 3),
        concurrency: flags.concurrency
            ? String(flags.concurrency)
                  .split(",")
                  .map((n) => parseInt(n, 10))
            : [1, 5, 25, 50],
        concurrencyRequests: num(flags.requests, 100),
        outDir: (flags.out ?? path.resolve(__dirname, "../../../perf-reports")).toString(),
        suites: requested,
        apiVersion: (flags.apiVersion ?? "0.0.0").toString(),
    };
}

export { ALL_SUITES };

function num(value: unknown, fallback: number): number {
    const parsed = parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFlags(argv: string[]): Record<string, string | boolean> {
    const flags: Record<string, string | boolean> = {};
    for (const arg of argv) {
        if (!arg.startsWith("--")) continue;
        const [key, ...rest] = arg.slice(2).split("=");
        flags[key] = rest.length ? rest.join("=") : true;
    }
    return flags;
}
