import type { SharedConfig } from "../config";

/**
 * A job that can run on the main thread or inside the shared worker, unchanged either way —
 * `run` is the fallback implementation as well as the worker implementation.
 */
export type WorkerTask<P, R> = {
    /** Open the Dexie database before running. */
    needsDb?: boolean;
    run: (payload: P) => Promise<R>;
    /**
     * Shrink the result before it is structured-cloned back to the main thread. Cloning is the
     * one cost a worker adds, and on a low-end device it is paid on both threads.
     */
    trim?: (result: R) => R;
    /**
     * `run` is a pure Dexie read, so it can be kept live with `subscribeInWorker`: the worker
     * re-runs it under `liveQuery`, which Dexie re-triggers on writes from any realm.
     */
    live?: boolean;
};

export type WorkerTaskPayload<T> = T extends { run: (payload: infer P) => unknown } ? P : never;
export type WorkerTaskResult<T> = T extends { run: (...args: never[]) => Promise<infer R> }
    ? R
    : never;

/**
 * The plain-data half of {@link SharedConfig}. `appLanguageIdsAsRef` is a Vue ref and is left
 * behind: reactivity does not survive a structured clone.
 */
export type WorkerConfigSnapshot = Pick<
    SharedConfig,
    "cms" | "docsIndex" | "apiUrl" | "contentPublishDateCutoff" | "offlineRetentionTtlMs"
>;

export type WorkerInitMessage = { kind: "init"; config?: WorkerConfigSnapshot };
export type WorkerRunMessage = { kind: "run"; id: number; task: string; payload: unknown };
export type WorkerCancelMessage = { kind: "cancel"; id: number };
export type WorkerSubscribeMessage = {
    kind: "subscribe";
    id: number;
    task: string;
    payload: unknown;
};
export type WorkerUnsubscribeMessage = { kind: "unsubscribe"; id: number };
export type WorkerMessage =
    | WorkerInitMessage
    | WorkerRunMessage
    | WorkerCancelMessage
    | WorkerSubscribeMessage
    | WorkerUnsubscribeMessage;

/** A subscription's replies reuse its id: one per emission, and a failure ends it. */
export type WorkerResponse =
    | { id: number; ok: true; result: unknown }
    | { id: number; ok: false; error: string };
