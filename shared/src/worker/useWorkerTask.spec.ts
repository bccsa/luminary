import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { FtsSearchOptions, FtsSearchResult } from "../fts/types";

const runInWorker = vi.fn();
vi.mock("./workerClient", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./workerClient")>()),
    runInWorker: (task: string, payload: unknown, options?: { signal?: AbortSignal }) =>
        runInWorker(task, payload, options),
}));

const { useWorkerTask } = await import("./useWorkerTask");
const { WorkerTaskAborted } = await import("./workerClient");

const options = (query: string): FtsSearchOptions => ({ query, languageId: "lang-eng" });
const results = [{ score: 1 }] as unknown as FtsSearchResult[];

/** Deferred so a test can control exactly when a run settles. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe("useWorkerTask", () => {
    beforeEach(() => {
        runInWorker.mockReset().mockResolvedValue(results);
    });

    it("runs on the current payload and exposes the result", async () => {
        const payload = ref(options("grace"));
        const { data, isRunning } = useWorkerTask("ftsSearch", payload);

        await vi.waitFor(() => expect(data.value).toBe(results));
        expect(runInWorker).toHaveBeenCalledWith("ftsSearch", options("grace"), expect.anything());
        expect(isRunning.value).toBe(false);
    });

    it("does not run while the payload is undefined", async () => {
        const payload = ref<FtsSearchOptions | undefined>(undefined);
        useWorkerTask("ftsSearch", payload);

        await nextTick();
        await nextTick();
        expect(runInWorker).not.toHaveBeenCalled();
    });

    it("abandons the in-flight run when the payload changes", async () => {
        const first = deferred<FtsSearchResult[]>();
        runInWorker.mockReturnValueOnce(first.promise).mockResolvedValueOnce(results);
        const payload = ref(options("grace"));
        const { data } = useWorkerTask("ftsSearch", payload);
        await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledTimes(1));

        const signal = runInWorker.mock.calls[0][2].signal as AbortSignal;
        payload.value = options("faith");
        await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledTimes(2));

        expect(signal.aborted).toBe(true);
        // A late result from the superseded run must not overwrite the newer one.
        first.resolve([{ score: 99 }] as unknown as FtsSearchResult[]);
        await vi.waitFor(() => expect(data.value).toBe(results));
    });

    it("waits out the debounce, so typing costs one run", async () => {
        vi.useFakeTimers();
        try {
            const payload = ref(options("g"));
            useWorkerTask("ftsSearch", payload, { debounceMs: 300 });
            payload.value = options("gr");
            await nextTick();
            payload.value = options("gra");
            await nextTick();
            expect(runInWorker).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(300);
            expect(runInWorker).toHaveBeenCalledTimes(1);
            expect(runInWorker).toHaveBeenCalledWith(
                "ftsSearch",
                options("gra"),
                expect.anything(),
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it("only runs on demand in manual mode", async () => {
        const payload = ref(options("grace"));
        const { run, data } = useWorkerTask("ftsSearch", payload, { manual: true });

        payload.value = options("faith");
        await nextTick();
        expect(runInWorker).not.toHaveBeenCalled();

        run();
        await vi.waitFor(() => expect(data.value).toBe(results));
        expect(runInWorker).toHaveBeenCalledWith("ftsSearch", options("faith"), expect.anything());
    });

    it("surfaces a failure but not an abort", async () => {
        runInWorker.mockRejectedValueOnce(new Error("boom"));
        const payload = ref(options("grace"));
        const { error } = useWorkerTask("ftsSearch", payload);
        await vi.waitFor(() => expect(error.value).toBeInstanceOf(Error));

        runInWorker.mockRejectedValueOnce(new WorkerTaskAborted());
        payload.value = options("faith");
        await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledTimes(2));
        await nextTick();
        expect(error.value).toBeInstanceOf(Error);
        expect((error.value as Error).message).toBe("boom");
    });

    it("abandons in-flight work when its scope is disposed", async () => {
        const scope = effectScope();
        const payload = ref(options("grace"));
        runInWorker.mockReturnValueOnce(deferred<FtsSearchResult[]>().promise);
        scope.run(() => useWorkerTask("ftsSearch", payload));
        await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledTimes(1));

        const signal = runInWorker.mock.calls[0][2].signal as AbortSignal;
        scope.stop();

        expect(signal.aborted).toBe(true);
    });
});
