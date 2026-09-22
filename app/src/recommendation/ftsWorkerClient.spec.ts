import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FtsSearchOptions, FtsSearchResult } from "luminary-shared";
import type { FtsWorkerRequest, FtsWorkerResponse } from "./ftsWorkerClient";

const ftsSearch = vi.fn();
vi.mock("luminary-shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("luminary-shared")>()),
    ftsSearch: (options: FtsSearchOptions) => ftsSearch(options),
}));

class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage: ((event: MessageEvent<FtsWorkerResponse>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    sent: FtsWorkerRequest[] = [];
    terminate = vi.fn();
    constructor() {
        FakeWorker.instances.push(this);
    }
    postMessage(request: FtsWorkerRequest) {
        this.sent.push(request);
    }
    reply(response: FtsWorkerResponse) {
        this.onmessage?.({ data: response } as MessageEvent<FtsWorkerResponse>);
    }
}

const options: FtsSearchOptions = { query: "grace", languageId: "lang-eng" };
const mainThreadResults = [{ score: 1 }] as unknown as FtsSearchResult[];
const workerResults = [{ score: 2 }] as unknown as FtsSearchResult[];

async function loadClient() {
    return import("./ftsWorkerClient");
}

describe("ftsSearchInWorker", () => {
    beforeEach(() => {
        vi.resetModules();
        FakeWorker.instances = [];
        ftsSearch.mockReset().mockResolvedValue(mainThreadResults);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("searches on the main thread when Web Workers are unavailable", async () => {
        vi.stubGlobal("Worker", undefined);
        const { ftsSearchInWorker } = await loadClient();

        expect(await ftsSearchInWorker(options)).toBe(mainThreadResults);
        expect(ftsSearch).toHaveBeenCalledWith(options);
    });

    it("returns the worker's results without searching on the main thread", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { ftsSearchInWorker } = await loadClient();

        const search = ftsSearchInWorker(options);
        const [worker] = FakeWorker.instances;
        expect(worker.sent).toEqual([{ id: 1, options }]);
        worker.reply({ id: 1, results: workerResults });

        expect(await search).toBe(workerResults);
        expect(ftsSearch).not.toHaveBeenCalled();
    });

    it("reuses one worker and matches each reply to its search", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { ftsSearchInWorker } = await loadClient();

        const first = ftsSearchInWorker(options);
        const second = ftsSearchInWorker({ ...options, query: "faith" });
        expect(FakeWorker.instances).toHaveLength(1);
        const [worker] = FakeWorker.instances;
        worker.reply({ id: 2, results: workerResults });
        worker.reply({ id: 1, results: [] });

        expect(await first).toEqual([]);
        expect(await second).toBe(workerResults);
    });

    it("reruns a search on the main thread when the worker reports an error", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { ftsSearchInWorker } = await loadClient();

        const search = ftsSearchInWorker(options);
        FakeWorker.instances[0].reply({ id: 1, error: "DatabaseClosedError" });

        expect(await search).toBe(mainThreadResults);
        expect(ftsSearch).toHaveBeenCalledWith(options);
    });

    it("stops using a worker that fails and reruns its pending searches", async () => {
        vi.stubGlobal("Worker", FakeWorker);
        const { ftsSearchInWorker } = await loadClient();

        const search = ftsSearchInWorker(options);
        const [worker] = FakeWorker.instances;
        worker.onerror?.({} as ErrorEvent);

        expect(await search).toBe(mainThreadResults);
        expect(worker.terminate).toHaveBeenCalled();

        await ftsSearchInWorker(options);
        expect(FakeWorker.instances).toHaveLength(1);
        expect(ftsSearch).toHaveBeenCalledTimes(2);
    });
});
