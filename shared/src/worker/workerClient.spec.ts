import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FtsSearchOptions, FtsSearchResult } from "../fts/types";
import type { WorkerMessage, WorkerResponse } from "./types";

const ftsSearch = vi.fn();
vi.mock("../fts/ftsSearch", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../fts/ftsSearch")>()),
    ftsSearch: (options: FtsSearchOptions) => ftsSearch(options),
}));

class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    sent: WorkerMessage[] = [];
    terminate = vi.fn();
    constructor() {
        FakeWorker.instances.push(this);
    }
    postMessage(message: WorkerMessage) {
        this.sent.push(message);
    }
    /** Requests only — the init message is bookkeeping, not work. */
    get runs() {
        return this.sent.filter((m) => m.kind === "run");
    }
    reply(response: WorkerResponse) {
        this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>);
    }
}

const options: FtsSearchOptions = { query: "grace", languageId: "lang-eng" };
const mainThreadResults = [{ score: 1 }] as unknown as FtsSearchResult[];
const workerResults = [{ score: 2 }] as unknown as FtsSearchResult[];

async function loadClient() {
    const client = await import("./workerClient");
    client.configureWorkerPool({ maxWorkers: 2 });
    return client;
}

describe("runInWorker", () => {
    beforeEach(() => {
        vi.resetModules();
        FakeWorker.instances = [];
        ftsSearch.mockReset().mockResolvedValue(mainThreadResults);
        vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("runs on the main thread when Web Workers are unavailable", async () => {
        vi.stubGlobal("Worker", undefined);
        const { runInWorker } = await loadClient();

        expect(await runInWorker("ftsSearch", options)).toBe(mainThreadResults);
        expect(ftsSearch).toHaveBeenCalledWith(options);
    });

    it("returns the worker's result without running on the main thread", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { runInWorker } = await loadClient();

        const search = runInWorker("ftsSearch", options);
        const [worker] = FakeWorker.instances;
        expect(worker.runs).toEqual([{ kind: "run", id: 1, task: "ftsSearch", payload: options }]);
        worker.reply({ id: 1, ok: true, result: workerResults });

        expect(await search).toBe(workerResults);
        expect(ftsSearch).not.toHaveBeenCalled();
    });

    it("sends the config once, before the first request", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { initConfig } = await import("../config");
        initConfig({ cms: false, docsIndex: "", apiUrl: "http://localhost:12345" });
        const { runInWorker } = await loadClient();

        runInWorker("ftsSearch", options);
        runInWorker("ftsSearch", options);

        const [worker] = FakeWorker.instances;
        expect(worker.sent.filter((m) => m.kind === "init")).toEqual([
            {
                kind: "init",
                config: {
                    cms: false,
                    docsIndex: "",
                    apiUrl: "http://localhost:12345",
                    contentPublishDateCutoff: undefined,
                    offlineRetentionTtlMs: undefined,
                },
            },
        ]);
        expect(worker.sent[0].kind).toBe("init");
    });

    it("matches each reply to its own request", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { runInWorker } = await loadClient();

        const first = runInWorker("ftsSearch", options);
        const second = runInWorker("ftsSearch", { ...options, query: "faith" });
        const [worker] = FakeWorker.instances;
        worker.reply({ id: 2, ok: true, result: workerResults });
        worker.reply({ id: 1, ok: true, result: [] });

        expect(await first).toEqual([]);
        expect(await second).toBe(workerResults);
    });

    it("grows to a second worker only once the first is busy, and no further", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { runInWorker } = await loadClient();

        runInWorker("ftsSearch", options);
        expect(FakeWorker.instances).toHaveLength(1);

        runInWorker("ftsSearch", options);
        expect(FakeWorker.instances).toHaveLength(2);

        runInWorker("ftsSearch", options);
        runInWorker("ftsSearch", options);
        expect(FakeWorker.instances).toHaveLength(2);
    });

    it("never spawns more workers than the device has spare cores", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        vi.stubGlobal("navigator", { hardwareConcurrency: 2 });
        const { runInWorker } = await loadClient();

        runInWorker("ftsSearch", options);
        runInWorker("ftsSearch", options);
        runInWorker("ftsSearch", options);

        expect(FakeWorker.instances).toHaveLength(1);
    });

    it("reuses a warm worker across calls rather than spawning per call", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { runInWorker } = await loadClient();

        const first = runInWorker("ftsSearch", options);
        const [worker] = FakeWorker.instances;
        worker.reply({ id: 1, ok: true, result: [] });
        await first;

        await Promise.resolve();
        runInWorker("ftsSearch", options);
        expect(FakeWorker.instances).toHaveLength(1);
    });

    it("tells the worker to drop an aborted task and rejects the caller", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { runInWorker, WorkerTaskAborted } = await loadClient();

        const controller = new AbortController();
        const search = runInWorker("ftsSearch", options, { signal: controller.signal });
        controller.abort();

        await expect(search).rejects.toBeInstanceOf(WorkerTaskAborted);
        expect(FakeWorker.instances[0].sent).toContainEqual({ kind: "cancel", id: 1 });
        expect(ftsSearch).not.toHaveBeenCalled();
    });

    it("ignores a reply that arrives for an already-aborted task", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { runInWorker } = await loadClient();

        const controller = new AbortController();
        const search = runInWorker("ftsSearch", options, { signal: controller.signal });
        controller.abort();
        await expect(search).rejects.toThrow();

        // A late reply must not resurrect the abandoned call or throw.
        FakeWorker.instances[0].reply({ id: 1, ok: true, result: workerResults });
    });

    it("reruns a task on the main thread when the worker reports a failure", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { runInWorker } = await loadClient();

        const search = runInWorker("ftsSearch", options);
        FakeWorker.instances[0].reply({ id: 1, ok: false, error: "DatabaseClosedError" });

        expect(await search).toBe(mainThreadResults);
        expect(ftsSearch).toHaveBeenCalledWith(options);
    });

    it("stops using workers that fail to load and reruns their pending tasks here", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { runInWorker } = await loadClient();

        const search = runInWorker("ftsSearch", options);
        const [worker] = FakeWorker.instances;
        worker.onerror?.({} as ErrorEvent);

        expect(await search).toBe(mainThreadResults);
        expect(worker.terminate).toHaveBeenCalled();

        await runInWorker("ftsSearch", options);
        expect(FakeWorker.instances).toHaveLength(1);
        expect(ftsSearch).toHaveBeenCalledTimes(2);
    });

    it("releaseWorkers terminates the pool but lets a later task spawn again", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { runInWorker, releaseWorkers } = await loadClient();

        const search = runInWorker("ftsSearch", options);
        releaseWorkers();

        expect(await search).toBe(mainThreadResults);
        expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();

        runInWorker("ftsSearch", options);
        expect(FakeWorker.instances).toHaveLength(2);
    });
});

describe("warmWorkers", () => {
    beforeEach(() => {
        vi.resetModules();
        FakeWorker.instances = [];
        vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("spawns one worker during idle time, so the first task doesn't pay for startup", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        vi.stubGlobal("requestIdleCallback", (cb: () => void) => cb());
        const { warmWorkers, runInWorker } = await loadClient();

        warmWorkers();
        expect(FakeWorker.instances).toHaveLength(1);

        warmWorkers();
        expect(FakeWorker.instances).toHaveLength(1);

        runInWorker("ftsSearch", options);
        expect(FakeWorker.instances).toHaveLength(1);
        expect(FakeWorker.instances[0].runs).toHaveLength(1);
    });
});
