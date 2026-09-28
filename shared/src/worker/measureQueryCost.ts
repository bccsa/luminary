import { db } from "../db/database";
import { mangoToDexie } from "../util/MangoQuery/mangoToDexie";
import type { MangoQuery } from "../util/MangoQuery/MangoTypes";
import { runInWorker } from "./workerClient";

/** Median timings, in milliseconds, for one query read each way. */
export type QueryCost = {
    resultCount: number;
    /** Serialized size of the result — what crosses the thread boundary. */
    resultBytes: number;
    /** Whole read on this thread: IndexedDB deserialization of every scanned record, plus filtering. */
    mainThreadMs: number;
    /** Wall-clock worker read, including cloning the result back. */
    workerRoundTripMs: number;
    /**
     * `structuredClone` of the result on this thread: an upper bound on what the worker path
     * still costs here, since only the deserialize half runs on this thread.
     */
    cloneMs: number;
};

function median(samples: number[]): number {
    const sorted = [...samples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

async function time(fn: () => unknown): Promise<number> {
    const start = performance.now();
    await fn();
    return performance.now() - start;
}

/**
 * Diagnostic: compare reading `query` on this thread with reading it through the worker, so
 * worker routing can be judged on the target device. A worker read can lose when the result is
 * nearly everything the index scan touched — then cloning it back costs about what was moved.
 */
export async function measureQueryCost(query: MangoQuery, runs = 5): Promise<QueryCost> {
    // Warm both paths so a cold worker or an unopened connection isn't counted.
    const result = await mangoToDexie(db.docs, query);
    await runInWorker("mangoQuery", query);

    const main: number[] = [];
    const worker: number[] = [];
    const clone: number[] = [];
    for (let i = 0; i < runs; i++) {
        main.push(await time(() => mangoToDexie(db.docs, query)));
        worker.push(await time(() => runInWorker("mangoQuery", query)));
        clone.push(await time(() => structuredClone(result)));
    }

    return {
        resultCount: result.length,
        resultBytes: new Blob([JSON.stringify(result)]).size,
        mainThreadMs: median(main),
        workerRoundTripMs: median(worker),
        cloneMs: median(clone),
    };
}
