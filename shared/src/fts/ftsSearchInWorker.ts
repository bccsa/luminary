import { runInWorker } from "../worker/workerClient";
import type { FtsSearchOptions, FtsSearchResult } from "./types";

/**
 * {@link ftsSearch} run off the main thread, so a burst of searches does not block scrolling or
 * taps. Results come back without `doc.fts`/`doc.ftsTokenCount` and must never be persisted.
 */
export function ftsSearchInWorker(options: FtsSearchOptions): Promise<FtsSearchResult[]> {
    return runInWorker("ftsSearch", options);
}

/**
 * {@link ftsSearchMany} run off the main thread. Prefer this over several
 * {@link ftsSearchInWorker} calls: it is one structured clone instead of one per search, and a
 * doc reached by several of them is loaded and tokenised once.
 */
export function ftsSearchManyInWorker(searches: FtsSearchOptions[]): Promise<FtsSearchResult[][]> {
    return runInWorker("ftsSearchMany", searches);
}
