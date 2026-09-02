import * as zlib from "node:zlib";
import { PerfConfig } from "./config";

/** Parsed `X-Perf-Trace` header — the API's own per-phase view of the request. */
export type ServerTrace = {
    r: string;
    t: number;
    s: Record<string, number>;
    db: { find: number; get: number; view: number; write: number; other: number; ms: number };
    m: Record<string, unknown>;
};

export type Timed<T = any> = {
    ok: boolean;
    status: number;
    /** Wall-clock ms measured by the client, including network and (de)serialization. */
    ms: number;
    /** Decoded response body size in bytes — what the client parses. */
    bytes: number;
    /**
     * Brotli-compressed size of the same body, computed locally. The API compresses with
     * @fastify/compress (br preferred) and sends chunked, so the true wire size is not
     * recoverable from the response; this is the closest honest estimate of it.
     */
    wireBytes: number;
    trace?: ServerTrace;
    body?: T;
    error?: string;
};

export class ApiClient {
    constructor(private readonly config: PerfConfig) {}

    get headers(): Record<string, string> {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (this.config.token) headers["Authorization"] = `Bearer ${this.config.token}`;
        if (this.config.providerId) headers["x-auth-provider-id"] = this.config.providerId;
        return headers;
    }

    async post<T = any>(path: string, body: unknown, keepBody = false): Promise<Timed<T>> {
        return this.send("POST", path, JSON.stringify(body), keepBody);
    }

    async get<T = any>(path: string, keepBody = false): Promise<Timed<T>> {
        return this.send("GET", path, undefined, keepBody);
    }

    private async send<T>(
        method: string,
        path: string,
        body: string | undefined,
        keepBody: boolean,
    ): Promise<Timed<T>> {
        const start = performance.now();
        try {
            const res = await fetch(`${this.config.baseUrl}${path}`, {
                method,
                headers: this.headers,
                body,
            });
            // Drain the body before stopping the clock — a timing that excludes transfer
            // would understate large sync responses, which is exactly what we're measuring.
            const text = await res.text();
            const ms = performance.now() - start;

            return {
                ok: res.ok,
                status: res.status,
                ms,
                bytes: Buffer.byteLength(text),
                wireBytes: compressedSize(text),
                trace: parseTrace(res.headers.get("x-perf-trace")),
                body: keepBody ? safeJson<T>(text) : undefined,
                error: res.ok ? undefined : text.slice(0, 300),
            };
        } catch (err: any) {
            return {
                ok: false,
                status: 0,
                ms: performance.now() - start,
                bytes: 0,
                wireBytes: 0,
                error: err?.message ?? String(err),
            };
        }
    }
}

/** Bodies above this are sampled rather than fully compressed — brotli on megabytes is slow. */
const COMPRESS_SAMPLE_LIMIT = 2_000_000;

function compressedSize(text: string): number {
    if (!text) return 0;
    try {
        if (text.length <= COMPRESS_SAMPLE_LIMIT) {
            return zlib.brotliCompressSync(new Uint8Array(Buffer.from(text))).length;
        }
        // Extrapolate from a prefix so a multi-megabyte sync response doesn't dominate the run.
        const sample = text.slice(0, COMPRESS_SAMPLE_LIMIT);
        const ratio =
            zlib.brotliCompressSync(new Uint8Array(Buffer.from(sample))).length /
            Buffer.byteLength(sample);
        return Math.round(Buffer.byteLength(text) * ratio);
    } catch {
        return 0;
    }
}

function parseTrace(header: string | null): ServerTrace | undefined {
    if (!header) return undefined;
    try {
        return JSON.parse(header) as ServerTrace;
    } catch {
        return undefined;
    }
}

function safeJson<T>(text: string): T | undefined {
    try {
        return JSON.parse(text) as T;
    } catch {
        return undefined;
    }
}
