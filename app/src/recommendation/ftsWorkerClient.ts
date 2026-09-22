import { ftsSearch, type FtsSearchOptions, type FtsSearchResult } from "luminary-shared";

export type FtsWorkerRequest = { id: number; options: FtsSearchOptions };
export type FtsWorkerResponse = { id: number; results?: FtsSearchResult[]; error?: string };

type Pending = {
    options: FtsSearchOptions;
    resolve: (results: FtsSearchResult[] | Promise<FtsSearchResult[]>) => void;
};

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
    if (worker !== undefined) return worker;
    if (typeof Worker === "undefined") return (worker = null);
    try {
        worker = new Worker(new URL("./fts.worker.ts", import.meta.url), { type: "module" });
    } catch {
        return (worker = null);
    }
    worker.onmessage = (event: MessageEvent<FtsWorkerResponse>) => {
        const call = pending.get(event.data.id);
        if (!call) return;
        pending.delete(event.data.id);
        const { results, error } = event.data;
        call.resolve(error === undefined ? (results ?? []) : ftsSearch(call.options));
    };
    worker.onerror = () => {
        // A worker that cannot load stays off for this session; searches in flight rerun here.
        worker?.terminate();
        worker = null;
        for (const call of pending.values()) call.resolve(ftsSearch(call.options));
        pending.clear();
    };
    return worker;
}

/**
 * {@link ftsSearch} run in a Web Worker, so a burst of recommendation searches does not block
 * the main thread. Falls back to the main thread when the worker cannot run or a search fails.
 */
export function ftsSearchInWorker(options: FtsSearchOptions): Promise<FtsSearchResult[]> {
    const w = getWorker();
    if (!w) return ftsSearch(options);
    const id = ++nextId;
    return new Promise((resolve) => {
        pending.set(id, { options, resolve });
        w.postMessage({ id, options } satisfies FtsWorkerRequest);
    });
}
