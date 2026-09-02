import { AsyncLocalStorage } from "node:async_hooks";

/** Timings and DB-call counts collected for a single request. */
export type PerfTrace = {
    route: string;
    startedAt: number;
    /** Named phase durations in ms. Repeated names accumulate. */
    spans: Record<string, number>;
    /** CouchDB round trips, counted at the nano scope so every caller is covered. */
    db: { find: number; get: number; view: number; write: number; other: number; ms: number };
    meta: Record<string, unknown>;
};

const storage = new AsyncLocalStorage<PerfTrace>();

let enabled: boolean | undefined;

/**
 * Whether per-request tracing is on (`PERF_TRACE=true`). Every hook short-circuits on
 * this so the default path costs one memoized boolean read.
 */
export function perfTraceEnabled(): boolean {
    if (enabled === undefined) enabled = process.env.PERF_TRACE === "true";
    return enabled;
}

/** Test seam: forget the memoized flag so a changed env var takes effect. */
export function resetPerfTraceFlag(): void {
    enabled = undefined;
}

export function runWithTrace<T>(route: string, fn: () => T): T {
    if (!perfTraceEnabled()) return fn();
    const trace: PerfTrace = {
        route,
        startedAt: performance.now(),
        spans: {},
        db: { find: 0, get: 0, view: 0, write: 0, other: 0, ms: 0 },
        meta: {},
    };
    return storage.run(trace, fn);
}

export function currentTrace(): PerfTrace | undefined {
    return perfTraceEnabled() ? storage.getStore() : undefined;
}

/** Time an async phase under `name`. Passes the callback straight through when tracing is off. */
export async function span<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const trace = currentTrace();
    if (!trace) return fn();
    const start = performance.now();
    try {
        return await fn();
    } finally {
        trace.spans[name] = round((trace.spans[name] ?? 0) + (performance.now() - start));
    }
}

/** Record a phase whose duration was measured elsewhere. */
export function mark(name: string, ms: number): void {
    const trace = currentTrace();
    if (!trace) return;
    trace.spans[name] = round((trace.spans[name] ?? 0) + ms);
}

export function traceMeta(meta: Record<string, unknown>): void {
    const trace = currentTrace();
    if (!trace) return;
    Object.assign(trace.meta, meta);
}

type DbCallKind = keyof Omit<PerfTrace["db"], "ms">;

function recordDbCall(kind: DbCallKind, ms: number): void {
    const trace = currentTrace();
    if (!trace) return;
    trace.db[kind] += 1;
    trace.db.ms = round(trace.db.ms + ms);
}

/** nano scope methods, mapped to the counter each one increments. */
const DB_METHOD_KINDS: Record<string, DbCallKind> = {
    find: "find",
    get: "get",
    head: "get",
    fetch: "get",
    list: "get",
    view: "view",
    viewWithList: "view",
    search: "view",
    insert: "write",
    bulk: "write",
    destroy: "write",
    atomic: "write",
};

/**
 * Wrap a nano document scope so every CouchDB round trip is counted and timed against
 * the active trace. Applied at the scope rather than per call site, so DB work done
 * outside the endpoints — notably the auth guard's identity lookups and its `lastLogin`
 * write — shows up in the same trace.
 */
export function instrumentDbScope<T extends object>(scope: T): T {
    return new Proxy(scope, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (typeof value !== "function" || typeof prop !== "string") return value;

            const kind = DB_METHOD_KINDS[prop] ?? "other";
            return function instrumented(this: unknown, ...args: unknown[]) {
                if (!currentTrace()) return value.apply(this === receiver ? target : this, args);
                const start = performance.now();
                const result = value.apply(this === receiver ? target : this, args);
                if (result && typeof (result as Promise<unknown>).then === "function") {
                    return (result as Promise<unknown>).then(
                        (res) => {
                            recordDbCall(kind, performance.now() - start);
                            return res;
                        },
                        (err) => {
                            recordDbCall(kind, performance.now() - start);
                            throw err;
                        },
                    );
                }
                recordDbCall(kind, performance.now() - start);
                return result;
            };
        },
    });
}

/**
 * Compact wire form for the `X-Perf-Trace` response header — short keys keep it well
 * inside header size limits and out of the response body, so traced responses stay
 * byte-identical for clients.
 */
export function serializeTrace(trace: PerfTrace): string {
    return JSON.stringify({
        r: trace.route,
        t: round(performance.now() - trace.startedAt),
        s: trace.spans,
        db: trace.db,
        m: trace.meta,
    });
}

function round(ms: number): number {
    return Math.round(ms * 1000) / 1000;
}
