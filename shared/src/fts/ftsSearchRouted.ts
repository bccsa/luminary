import { runInWorker } from "../worker/workerClient";
import type { FtsSearchOptions, FtsSearchResult } from "./types";

/**
 * The library's full-text search entry point. Runs off the main thread when a worker is
 * available and on this thread when it is not, so a burst of searches does not block scrolling
 * or taps. Results come back without `doc.fts`/`doc.ftsTokenCount` and must never be persisted.
 *
 * Routing lives here rather than in `ftsSearch.ts` because the worker bundles that module: an
 * import of the client from there would pull the pool into the worker it is meant to drive.
 */
export function ftsSearch(options: FtsSearchOptions): Promise<FtsSearchResult[]> {
    return runInWorker("ftsSearch", options);
}

/**
 * Several searches in one round trip. Prefer this over several {@link ftsSearch} calls: it is
 * one structured clone instead of one per search, and a doc reached by several of them is
 * loaded and tokenised once.
 */
export function ftsSearchMany(searches: FtsSearchOptions[]): Promise<FtsSearchResult[][]> {
    return runInWorker("ftsSearchMany", searches);
}

/** @deprecated Use {@link ftsSearch} — it already routes to a worker. */
export const ftsSearchInWorker = ftsSearch;

/** @deprecated Use {@link ftsSearchMany} — it already routes to a worker. */
export const ftsSearchManyInWorker = ftsSearchMany;
