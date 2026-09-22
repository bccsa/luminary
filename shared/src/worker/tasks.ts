import { ftsSearch, ftsSearchMany, trimFtsResults } from "../fts/ftsSearch";
import type { FtsSearchOptions, FtsSearchResult } from "../fts/types";
import type { WorkerTask } from "./types";

/**
 * Every job that may run off the main thread. Adding one entry here is the whole of "make this
 * run in a worker" — the client, the worker host and the typing all read from this map.
 *
 * Import implementations from their own module rather than the package barrel: the worker bundles
 * whatever this file reaches, and the barrel drags in the socket, REST and Vue layers.
 */
export const workerTasks = {
    ftsSearch: {
        needsDb: true,
        run: (options: FtsSearchOptions) => ftsSearch(options),
        trim: trimFtsResults,
    } satisfies WorkerTask<FtsSearchOptions, FtsSearchResult[]>,

    ftsSearchMany: {
        needsDb: true,
        run: (searches: FtsSearchOptions[]) => ftsSearchMany(searches),
        trim: (pages: FtsSearchResult[][]) => pages.map(trimFtsResults),
    } satisfies WorkerTask<FtsSearchOptions[], FtsSearchResult[][]>,
};

export type WorkerTasks = typeof workerTasks;
export type WorkerTaskName = keyof WorkerTasks;
