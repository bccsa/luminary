import { ftsSearchLocal, ftsSearchManyLocal, trimFtsResults } from "../fts/ftsSearch";
import { scanCorpus, type CorpusScanResult } from "../fts/corpusScan";
import { mangoToDexie } from "../util/MangoQuery/mangoToDexie";
import type { MangoQuery } from "../util/MangoQuery/MangoTypes";
import { db } from "../db/database";
import type { BaseDocumentDto } from "../types";
import type { FtsSearchOptions, FtsSearchResult } from "../fts/types";
import type { WorkerTask } from "./types";

/**
 * Every job that may run off the main thread. Adding one entry here is the whole of "make this
 * run in a worker" — the client, the worker host and the typing all read from this map.
 *
 * Import implementations from their own module rather than the package barrel: the worker bundles
 * whatever this file reaches, and the barrel drags in the socket, REST and Vue layers. For the
 * same reason nothing reached from here may import the worker client.
 */
export const workerTasks = {
    ftsSearch: {
        needsDb: true,
        run: (options: FtsSearchOptions) => ftsSearchLocal(options),
        trim: trimFtsResults,
    } satisfies WorkerTask<FtsSearchOptions, FtsSearchResult[]>,

    ftsSearchMany: {
        needsDb: true,
        run: (searches: FtsSearchOptions[]) => ftsSearchManyLocal(searches),
        trim: (pages: FtsSearchResult[][]) => pages.map(trimFtsResults),
    } satisfies WorkerTask<FtsSearchOptions[], FtsSearchResult[][]>,

    corpusScan: {
        needsDb: true,
        run: () => scanCorpus(),
    } satisfies WorkerTask<void, CorpusScanResult>,

    mangoQuery: {
        needsDb: true,
        run: (query: MangoQuery) => mangoToDexie<BaseDocumentDto>(db.docs, query),
    } satisfies WorkerTask<MangoQuery, BaseDocumentDto[]>,
};

export type WorkerTasks = typeof workerTasks;
export type WorkerTaskName = keyof WorkerTasks;
