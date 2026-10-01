import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerResponse } from "./types";

const ftsSearch = vi.fn();
const ftsSearchMany = vi.fn();
const trimFtsResults = vi.fn();
const openDatabaseInWorker = vi.fn();
const initConfig = vi.fn();

vi.mock("../fts/ftsSearch", () => ({
    ftsSearchLocal: (options: unknown) => ftsSearch(options),
    ftsSearchManyLocal: (searches: unknown) => ftsSearchMany(searches),
    trimFtsResults: (results: unknown) => trimFtsResults(results),
}));
vi.mock("../db/database", () => ({
    openDatabaseInWorker: () => openDatabaseInWorker(),
    // The task registry reaches for `db` too; no test here exercises a db-backed task.
    db: {},
}));
vi.mock("../config", () => ({
    initConfig: (config: unknown) => initConfig(config),
}));

const options = { query: "grace", languageId: "lang-eng" };

async function newHost() {
    const { createWorkerHost } = await import("./workerHost");
    const posted: WorkerResponse[] = [];
    const handle = createWorkerHost((response) => posted.push(response));
    return { handle, posted };
}

describe("createWorkerHost", () => {
    beforeEach(() => {
        vi.resetModules();
        ftsSearch.mockReset().mockResolvedValue([]);
        ftsSearchMany.mockReset().mockResolvedValue([]);
        trimFtsResults.mockReset().mockImplementation((results) => results);
        openDatabaseInWorker.mockReset().mockResolvedValue(undefined);
        initConfig.mockReset();
    });

    it("opens the database once and answers each request with its id", async () => {
        const { handle, posted } = await newHost();
        ftsSearch.mockResolvedValueOnce([{ score: 1 }]);

        handle({ kind: "run", id: 1, task: "ftsSearch", payload: options });
        handle({ kind: "run", id: 2, task: "ftsSearch", payload: options });
        await vi.waitFor(() => expect(posted).toHaveLength(2));

        expect(posted).toEqual([
            { id: 1, ok: true, result: [{ score: 1 }] },
            { id: 2, ok: true, result: [] },
        ]);
        expect(openDatabaseInWorker).toHaveBeenCalledTimes(1);
        expect(ftsSearch).toHaveBeenCalledWith(options);
    });

    it("runs requests one at a time rather than interleaving a burst", async () => {
        const { handle, posted } = await newHost();
        let running = 0;
        let maxConcurrent = 0;
        ftsSearch.mockImplementation(async () => {
            maxConcurrent = Math.max(maxConcurrent, ++running);
            await Promise.resolve();
            running--;
            return [];
        });

        for (let id = 1; id <= 4; id++)
            handle({ kind: "run", id, task: "ftsSearch", payload: options });
        await vi.waitFor(() => expect(posted).toHaveLength(4));

        expect(maxConcurrent).toBe(1);
    });

    it("skips a queued request that was cancelled before it ran", async () => {
        const { handle, posted } = await newHost();

        handle({ kind: "run", id: 1, task: "ftsSearch", payload: options });
        handle({ kind: "run", id: 2, task: "ftsSearch", payload: options });
        handle({ kind: "run", id: 3, task: "ftsSearch", payload: options });
        handle({ kind: "cancel", id: 2 });
        await vi.waitFor(() => expect(posted).toHaveLength(2));

        expect(posted.map((r) => r.id)).toEqual([1, 3]);
        expect(ftsSearch).toHaveBeenCalledTimes(2);
    });

    it("trims the result before replying, so the clone back is as small as possible", async () => {
        const { handle, posted } = await newHost();
        const untrimmed = [{ score: 1, doc: { _id: "doc-1", fts: ["abc:1"] } }];
        ftsSearch.mockResolvedValueOnce(untrimmed);
        trimFtsResults.mockReturnValueOnce([{ score: 1, doc: { _id: "doc-1" } }]);

        handle({ kind: "run", id: 1, task: "ftsSearch", payload: options });
        await vi.waitFor(() => expect(posted).toHaveLength(1));

        expect(trimFtsResults).toHaveBeenCalledWith(untrimmed);
        expect(posted[0]).toEqual({
            id: 1,
            ok: true,
            result: [{ score: 1, doc: { _id: "doc-1" } }],
        });
    });

    it("reports a failed task and reopens the database for the next one", async () => {
        const { handle, posted } = await newHost();
        ftsSearch.mockRejectedValueOnce(new Error("DatabaseClosedError"));

        handle({ kind: "run", id: 1, task: "ftsSearch", payload: options });
        handle({ kind: "run", id: 2, task: "ftsSearch", payload: options });
        await vi.waitFor(() => expect(posted).toHaveLength(2));

        expect(posted[0]).toEqual({ id: 1, ok: false, error: "Error: DatabaseClosedError" });
        expect(posted[1]).toEqual({ id: 2, ok: true, result: [] });
        expect(openDatabaseInWorker).toHaveBeenCalledTimes(2);
    });

    it("reports an unknown task instead of hanging the caller", async () => {
        const { handle, posted } = await newHost();

        handle({ kind: "run", id: 1, task: "nope", payload: undefined });
        await vi.waitFor(() => expect(posted).toHaveLength(1));

        expect(posted[0]).toEqual({ id: 1, ok: false, error: "Unknown worker task: nope" });
    });

    it("applies the config and opens the database on init", async () => {
        const { handle } = await newHost();
        const config = { cms: false, docsIndex: "", apiUrl: "http://localhost:12345" };

        handle({ kind: "init", config });

        expect(initConfig).toHaveBeenCalledWith(config);
        await vi.waitFor(() => expect(openDatabaseInWorker).toHaveBeenCalledTimes(1));
    });

    it("retries the database open on the next task when warming up failed", async () => {
        const { handle, posted } = await newHost();
        openDatabaseInWorker.mockRejectedValueOnce(new Error("luminary-db does not exist yet"));

        handle({ kind: "init" });
        await vi.waitFor(() => expect(openDatabaseInWorker).toHaveBeenCalledTimes(1));

        handle({ kind: "run", id: 1, task: "ftsSearch", payload: options });
        await vi.waitFor(() => expect(posted).toHaveLength(1));

        expect(openDatabaseInWorker).toHaveBeenCalledTimes(2);
        expect(posted[0]).toEqual({ id: 1, ok: true, result: [] });
    });
});
