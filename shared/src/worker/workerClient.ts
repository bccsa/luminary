import { liveQuery, type Subscription } from "dexie";
import { config } from "../config";
import {
    workerTasks,
    type LiveWorkerTaskName,
    type WorkerTaskName,
    type WorkerTasks,
} from "./tasks";
import type {
    WorkerConfigSnapshot,
    WorkerMessage,
    WorkerResponse,
    WorkerTask,
    WorkerTaskPayload,
    WorkerTaskResult,
} from "./types";

/** Rejection raised when a task is abandoned via its `AbortSignal`. */
export class WorkerTaskAborted extends Error {
    constructor() {
        super("Worker task aborted");
        this.name = "AbortError";
    }
}

type PooledWorker = { worker: Worker; inFlight: Set<number> };

type Pending = {
    task: WorkerTaskName;
    payload: unknown;
    /** Accepts a promise so a failed worker call can settle on the main-thread rerun. */
    settle: (result: unknown | Promise<unknown>) => void;
};

type LiveSubscriptionEntry = {
    task: LiveWorkerTaskName;
    payload: unknown;
    next: (result: unknown) => void;
    error?: (error: unknown) => void;
    /** The worker serving it, or `undefined` once it runs on this thread. */
    pooled?: PooledWorker;
    stop: () => void;
};

/** Delay before a failed main-thread live read resubscribes, matching `useDexieLiveQuery`. */
const LIVE_RETRY_MS = 100;

/**
 * Hard ceiling on worker threads. Budget phones routinely report 8 weak cores, so the constant
 * — not the core count — is what keeps the device from thrashing; the core count only lowers it
 * further on genuinely small hardware.
 */
const WORKER_LIMIT = 2;

let pool: PooledWorker[] = [];
let pending = new Map<number, Pending>();
const subscriptions = new Map<number, LiveSubscriptionEntry>();
let nextId = 0;
/** A worker that cannot load stays off for the rest of the session. */
let workersDisabled = false;
let workerLimit = WORKER_LIMIT;
let createWorker = () =>
    new Worker(new URL("./luminary.worker.ts", import.meta.url), { type: "module" });

function maxWorkers() {
    const cores = globalThis.navigator?.hardwareConcurrency ?? 2;
    return Math.min(workerLimit, Math.max(1, cores - 1));
}

function configSnapshot(): WorkerConfigSnapshot | undefined {
    if (!config) return undefined;
    const { cms, docsIndex, apiUrl, contentPublishDateCutoff, offlineRetentionTtlMs } = config;
    return { cms, docsIndex, apiUrl, contentPublishDateCutoff, offlineRetentionTtlMs };
}

function post(pooled: PooledWorker, message: WorkerMessage) {
    pooled.worker.postMessage(message);
}

function spawn(): PooledWorker | null {
    if (workersDisabled) return null;
    if (typeof Worker === "undefined") {
        workersDisabled = true;
        return null;
    }
    let worker: Worker;
    try {
        worker = createWorker();
    } catch {
        workersDisabled = true;
        return null;
    }
    const pooled: PooledWorker = { worker, inFlight: new Set() };
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => onReply(pooled, event.data);
    worker.onerror = onWorkerError;
    pool.push(pooled);
    post(pooled, { kind: "init", config: configSnapshot() });
    return pooled;
}

/**
 * Pick the least-loaded worker, growing the pool only when every existing worker is already
 * busy. Workers are never spawned per call — the ~40ms startup plus the IndexedDB open would
 * cost more than the work being moved, and a warm worker keeps its FTS caches.
 */
function acquire(): PooledWorker | null {
    if (workersDisabled) return null;
    let best: PooledWorker | undefined;
    for (const pooled of pool) {
        if (!best || pooled.inFlight.size < best.inFlight.size) best = pooled;
    }
    if ((!best || best.inFlight.size > 0) && pool.length < maxWorkers()) {
        return spawn() ?? best ?? null;
    }
    return best ?? null;
}

/**
 * Run a task on this thread, applying the same `trim` the worker path applies. Both paths must
 * return one shape: FTS results carry `fts`/`ftsTokenCount` that callers are forbidden to
 * persist, and whether they are present must not depend on a worker being available.
 */
function runHere(task: WorkerTaskName, payload: unknown): Promise<unknown> {
    const entry = workerTasks[task] as WorkerTask<unknown, unknown>;
    return Promise.resolve(entry.run(payload)).then((result) =>
        entry.trim ? entry.trim(result) : result,
    );
}

/** Keep a live task on this thread, resubscribing after an error as `useDexieLiveQuery` does. */
function subscribeHere(sub: LiveSubscriptionEntry) {
    const entry = workerTasks[sub.task] as WorkerTask<unknown, unknown>;
    let subscription: Subscription | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
        subscription = liveQuery(async () => {
            const result = await entry.run(sub.payload);
            return entry.trim ? entry.trim(result) : result;
        }).subscribe({
            next: sub.next,
            error: (error) => {
                sub.error?.(error);
                retryTimer = setTimeout(start, LIVE_RETRY_MS);
            },
        });
    };
    sub.pooled = undefined;
    sub.stop = () => {
        clearTimeout(retryTimer);
        subscription?.unsubscribe();
    };
    start();
}

function onReply(pooled: PooledWorker, response: WorkerResponse) {
    const sub = subscriptions.get(response.id);
    if (sub) {
        if (sub.pooled !== pooled) return; // a late emission from before it moved here
        if (response.ok) sub.next(response.result);
        else subscribeHere(sub);
        return;
    }
    pooled.inFlight.delete(response.id);
    const call = pending.get(response.id);
    if (!call) return; // cancelled while in flight
    pending.delete(response.id);
    call.settle(response.ok ? response.result : runHere(call.task, call.payload));
}

function onWorkerError() {
    workersDisabled = true;
    rerunPendingHere();
}

function rerunPendingHere() {
    for (const pooled of pool) pooled.worker.terminate();
    pool = [];
    const calls = Array.from(pending.values());
    pending = new Map();
    for (const call of calls) call.settle(runHere(call.task, call.payload));
    subscriptions.forEach((sub) => sub.pooled && subscribeHere(sub));
}

/**
 * Run a registered task off the main thread, falling back to running it here when no worker is
 * available (SSG prerender, jsdom, an old browser) or when the worker reports a failure.
 */
export function runInWorker<K extends WorkerTaskName>(
    task: K,
    payload: WorkerTaskPayload<WorkerTasks[K]>,
    options: { signal?: AbortSignal } = {},
): Promise<WorkerTaskResult<WorkerTasks[K]>> {
    type Result = WorkerTaskResult<WorkerTasks[K]>;
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(new WorkerTaskAborted());

    const pooled = acquire();
    if (!pooled) return runHere(task, payload) as Promise<Result>;

    const id = ++nextId;
    return new Promise<Result>((resolve, reject) => {
        pending.set(id, { task, payload, settle: resolve as Pending["settle"] });
        pooled.inFlight.add(id);
        signal?.addEventListener(
            "abort",
            () => {
                if (!pending.delete(id)) return;
                pooled.inFlight.delete(id);
                post(pooled, { kind: "cancel", id });
                reject(new WorkerTaskAborted());
            },
            { once: true },
        );
        try {
            post(pooled, { kind: "run", id, task, payload });
        } catch {
            // A payload that won't structured-clone would otherwise reject the call. Run it
            // here instead: every other worker failure degrades this way too.
            pending.delete(id);
            pooled.inFlight.delete(id);
            resolve(runHere(task, payload) as Promise<Result>);
        }
    });
}

/**
 * Keep a live task's result current from a worker: `next` receives the first result and one
 * more after every committed write that could change it. Falls back to a `liveQuery` on this
 * thread when no worker is available or the worker fails, so a subscription never goes stale.
 * `error` fires only for a failure on this thread, which retries on its own. Returns the
 * unsubscribe.
 */
export function subscribeInWorker<K extends LiveWorkerTaskName>(
    task: K,
    payload: WorkerTaskPayload<WorkerTasks[K]>,
    handlers: {
        next: (result: WorkerTaskResult<WorkerTasks[K]>) => void;
        error?: (error: unknown) => void;
    },
): () => void {
    const id = ++nextId;
    const sub: LiveSubscriptionEntry = {
        task,
        payload,
        next: handlers.next as (result: unknown) => void,
        error: handlers.error,
        stop: () => undefined,
    };
    subscriptions.set(id, sub);

    const pooled = acquire();
    if (pooled) {
        try {
            post(pooled, { kind: "subscribe", id, task, payload });
            sub.pooled = pooled;
            sub.stop = () => post(pooled, { kind: "unsubscribe", id });
        } catch {
            subscribeHere(sub);
        }
    } else {
        subscribeHere(sub);
    }

    return () => {
        if (!subscriptions.delete(id)) return;
        sub.stop();
    };
}

/**
 * Start a worker and let it open the database while the main thread is idle, so the first real
 * task doesn't pay the startup cost. Safe to call before the database exists.
 */
export function warmWorkers() {
    if (workersDisabled || pool.length > 0) return;
    const idle = globalThis.requestIdleCallback;
    if (idle) idle(() => spawn());
    else setTimeout(() => spawn(), 0);
}

/**
 * Terminate the pool, rerunning anything in flight here. Workers respawn on the next task —
 * there is deliberately no idle timeout, because respawning costs more than an idle worker does.
 */
export function releaseWorkers() {
    rerunPendingHere();
}

/**
 * Override how workers are created or how many may run. The factory exists for consumers whose
 * bundler cannot resolve the worker entry from this package, and for tests.
 */
export function configureWorkerPool(options: { createWorker?: () => Worker; maxWorkers?: number }) {
    if (options.createWorker) {
        createWorker = options.createWorker;
        workersDisabled = false;
    }
    if (options.maxWorkers !== undefined) workerLimit = Math.max(1, options.maxWorkers);
}
