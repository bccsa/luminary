import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FtsSearchOptions } from "luminary-shared";
import type { FtsWorkerRequest, FtsWorkerResponse } from "./ftsWorkerClient";

const ftsSearch = vi.fn();
const openDatabaseForFtsWorker = vi.fn();
vi.mock("luminary-shared", () => ({
    ftsSearch: (options: FtsSearchOptions) => ftsSearch(options),
    openDatabaseForFtsWorker: () => openDatabaseForFtsWorker(),
}));

const options: FtsSearchOptions = { query: "grace", languageId: "lang-eng" };

async function send(request: FtsWorkerRequest): Promise<FtsWorkerResponse> {
    const postMessage = vi.spyOn(self, "postMessage").mockImplementation(() => undefined);
    await (self.onmessage as (event: MessageEvent) => Promise<void>)({
        data: request,
    } as MessageEvent);
    const response = postMessage.mock.calls.at(-1)?.[0] as FtsWorkerResponse;
    postMessage.mockRestore();
    return response;
}

describe("fts.worker", () => {
    beforeEach(async () => {
        vi.resetModules();
        ftsSearch.mockReset().mockResolvedValue([]);
        openDatabaseForFtsWorker.mockReset().mockResolvedValue(undefined);
        await import("./fts.worker");
    });

    it("opens the database once and answers each search with its id", async () => {
        ftsSearch.mockResolvedValueOnce([{ score: 1 }]);

        expect(await send({ id: 1, options })).toEqual({ id: 1, results: [{ score: 1 }] });
        expect(await send({ id: 2, options })).toEqual({ id: 2, results: [] });
        expect(openDatabaseForFtsWorker).toHaveBeenCalledTimes(1);
        expect(ftsSearch).toHaveBeenCalledWith(options);
    });

    it("reports a failed search and reopens the database for the next one", async () => {
        ftsSearch.mockRejectedValueOnce(new Error("DatabaseClosedError"));

        expect(await send({ id: 1, options })).toEqual({
            id: 1,
            error: "Error: DatabaseClosedError",
        });
        expect(await send({ id: 2, options })).toEqual({ id: 2, results: [] });
        expect(openDatabaseForFtsWorker).toHaveBeenCalledTimes(2);
    });
});
