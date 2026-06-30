import "fake-indexeddb/auto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import { AckStatus, ChangeReqDto, DocType, LocalChangeDto } from "../types";
import { db, initDatabase } from "../db/database";
import { getSocket, isConnected } from "../socket/socketio";
import { changeReqErrors, initConfig } from "../config";
import { Server } from "socket.io";
import waitForExpect from "wait-for-expect";
import * as RestApi from "../api/RestApi";
import { useDexieLiveQuery } from "../util";
import { syncLocalChanges, type SyncLocalChangesHandle } from "./syncLocalChanges";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const changeRequestMock = vi.fn();

describe("syncLocalChanges", () => {
    const socketServer = new Server(12344);
    let localChanges: Ref<LocalChangeDto[]>;
    let handle: SyncLocalChangesHandle;

    beforeAll(async () => {
        initConfig({
            cms: true,
            docsIndex: "parentId, language, [type+docType]",
            apiUrl: "http://localhost:12344",
            appLanguageIdsAsRef: ref([]),
        });

        await initDatabase();

        const socket = getSocket();

        vi.spyOn(RestApi, "getRest").mockReturnValue({
            changeRequest: changeRequestMock,
        } as unknown as any);

        localChanges = useDexieLiveQuery(
            () => db.localChanges.toArray() as unknown as Promise<LocalChangeDto[]>,
            { initialValue: [] as unknown as LocalChangeDto[] },
        );

        socket.disconnect();
    });

    beforeEach(() => {
        // Fresh registration per test → fresh closure `running`/`drainPromise`, so a drain
        // left mid-flight by a prior test can never bleed into this one.
        handle = syncLocalChanges(localChanges);
    });

    afterEach(async () => {
        // Drop offline first so any in-flight drain bails at its next await boundary.
        getSocket().disconnect();
        socketServer.removeAllListeners();
        await waitForExpect(() => expect(isConnected.value).toBe(false));

        // Deterministically join the in-flight drain and unsubscribe the watcher BEFORE
        // resetting the shared mock / clearing the queue. This is the fix: no leaked
        // send() can land on the next test's changeRequestMock, and the closure `running`
        // flag can never be stuck true across tests.
        await handle.stop();

        // Reset (not just clear) so any leftover mockResolvedValueOnce/mockImplementationOnce
        // entries from a previous test don't bleed into the next one.
        changeRequestMock.mockReset();
        await db.docs.clear();
        await db.localChanges.clear();
        changeReqErrors.value = [];
    });

    afterAll(async () => {
        vi.restoreAllMocks();
        await db.docs.clear();
        await db.localChanges.clear();
    });

    const connect = () => {
        socketServer.on("connection", (socket) => {
            socket.emit("clientConfig", {});
        });
        getSocket({ reconnect: true });
    };

    const ack = (id: number, status: AckStatus = AckStatus.Accepted) => ({ id, ack: status });

    // --- Core behaviour preserved from the previous implementation ---

    it("sends a change request when there are local changes and we are online", async () => {
        connect();

        const localChange: ChangeReqDto = {
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        };
        changeRequestMock.mockResolvedValueOnce(ack(1234));

        await db.localChanges.put(localChange);

        await waitForExpect(async () => {
            expect(changeRequestMock).toHaveBeenCalled();
            const formData = changeRequestMock.mock.calls[0][0] as FormData;
            expect([...formData.entries()]).toEqual(
                expect.arrayContaining([
                    ["changeRequest__json", JSON.stringify(localChange)],
                ]),
            );
        });
    });

    it("removes the local change from the queue once acked", async () => {
        changeRequestMock.mockResolvedValueOnce(ack(1234));
        await db.localChanges.put({
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        });
        expect(await db.localChanges.get(1234)).toBeDefined();

        connect();

        await waitForExpect(async () => {
            expect(await db.localChanges.get(1234)).toBeUndefined();
            expect(await db.localChanges.count()).toBe(0);
        });
    });

    it("queues changes while offline and drains them on reconnect", async () => {
        const localChange: ChangeReqDto = {
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        };
        changeRequestMock.mockResolvedValueOnce(ack(1234));

        await db.localChanges.put(localChange);

        // Nothing should be sent while offline.
        await wait(300);
        expect(changeRequestMock).not.toHaveBeenCalled();

        connect();

        await waitForExpect(async () => {
            expect(changeRequestMock).toHaveBeenCalledTimes(1);
            expect(await db.localChanges.count()).toBe(0);
        });
    });

    // --- New: drain loop processes the whole queue without per-item re-entry ---

    it("drains multiple queued changes sequentially in a single pass", async () => {
        const c1: ChangeReqDto = {
            id: 1,
            doc: { _id: "a", type: DocType.Post, updatedTimeUtc: 1 },
        };
        const c2: ChangeReqDto = {
            id: 2,
            doc: { _id: "b", type: DocType.Post, updatedTimeUtc: 2 },
        };
        const c3: ChangeReqDto = {
            id: 3,
            doc: { _id: "c", type: DocType.Post, updatedTimeUtc: 3 },
        };
        changeRequestMock
            .mockResolvedValueOnce(ack(1))
            .mockResolvedValueOnce(ack(2))
            .mockResolvedValueOnce(ack(3));

        await db.localChanges.bulkPut([c1, c2, c3]);

        connect();

        await waitForExpect(async () => {
            expect(changeRequestMock).toHaveBeenCalledTimes(3);
            expect(await db.localChanges.count()).toBe(0);
        });

        // Order should be FIFO — first call carries c1, then c2, then c3.
        const sentIds = changeRequestMock.mock.calls.map((call) => {
            const fd = call[0] as FormData;
            const entry = [...fd.entries()].find(([k]) => k === "changeRequest__json");
            return JSON.parse(entry![1] as string).id;
        });
        expect(sentIds).toEqual([1, 2, 3]);
    });

    // --- Failure / recovery semantics ---

    it("retries the head 3 times on non-ack, then bails without touching the rest", async () => {
        connect();
        await waitForExpect(() => expect(isConnected.value).toBe(true));

        const c1: ChangeReqDto = {
            id: 10,
            doc: { _id: "x", type: DocType.Post, updatedTimeUtc: 1 },
        };
        const c2: ChangeReqDto = {
            id: 11,
            doc: { _id: "y", type: DocType.Post, updatedTimeUtc: 2 },
        };

        // All three attempts on c1 return no ack. After the cap, drain bails
        // without ever touching c2.
        changeRequestMock
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined);

        await db.localChanges.bulkPut([c1, c2]);

        await waitForExpect(() => {
            expect(changeRequestMock).toHaveBeenCalledTimes(3);
        });

        // Drain should not keep retrying past the cap.
        await wait(300);
        expect(changeRequestMock).toHaveBeenCalledTimes(3);
        expect(await db.localChanges.count()).toBe(2);

        // Every call was for c1 — c2 was never attempted.
        const sentIds = changeRequestMock.mock.calls.map((call) => {
            const fd = call[0] as FormData;
            const entry = [...fd.entries()].find(([k]) => k === "changeRequest__json");
            return JSON.parse(entry![1] as string).id;
        });
        expect(new Set(sentIds)).toEqual(new Set([10]));
    });

    it("surfaces an error to changeReqErrors after exhausting retries", async () => {
        connect();
        await waitForExpect(() => expect(isConnected.value).toBe(true));

        const failing: ChangeReqDto = {
            id: 100,
            doc: { _id: "fail-error", type: DocType.Post, updatedTimeUtc: 1 },
        };
        changeRequestMock
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined);

        expect(changeReqErrors.value).toEqual([]);

        await db.localChanges.put(failing);

        await waitForExpect(() => {
            expect(changeReqErrors.value.length).toBe(1);
            expect(changeReqErrors.value[0]).toMatch(/refresh/i);
        });
    });

    it("clears changeReqErrors on a successful ack", async () => {
        connect();
        await waitForExpect(() => expect(isConnected.value).toBe(true));

        changeReqErrors.value = ["stale error from a previous attempt"];

        changeRequestMock.mockResolvedValueOnce(ack(110));
        await db.localChanges.put({
            id: 110,
            doc: { _id: "ok", type: DocType.Post, updatedTimeUtc: 1 },
        } as ChangeReqDto);

        await waitForExpect(async () => {
            expect(await db.localChanges.count()).toBe(0);
            expect(changeReqErrors.value).toEqual([]);
        });
    });

    it("self-heals a transient failure within the retry cap and keeps draining", async () => {
        connect();
        await waitForExpect(() => expect(isConnected.value).toBe(true));

        const c1: ChangeReqDto = {
            id: 15,
            doc: { _id: "flaky", type: DocType.Post, updatedTimeUtc: 1 },
        };
        const c2: ChangeReqDto = {
            id: 16,
            doc: { _id: "next", type: DocType.Post, updatedTimeUtc: 2 },
        };

        // c1: two failures then a success on the third attempt.
        // c2: succeeds first try. attempts counter must reset after c1 acks.
        changeRequestMock
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(ack(15))
            .mockResolvedValueOnce(ack(16));

        await db.localChanges.bulkPut([c1, c2]);

        await waitForExpect(async () => {
            expect(changeRequestMock).toHaveBeenCalledTimes(4);
            expect(await db.localChanges.count()).toBe(0);
        });
    });

    it("retries the failed item on the next localChanges mutation", async () => {
        connect();
        await waitForExpect(() => expect(isConnected.value).toBe(true));

        const failing: ChangeReqDto = {
            id: 20,
            doc: { _id: "fail", type: DocType.Post, updatedTimeUtc: 1 },
        };
        // Three non-acks burn through the retry cap.
        changeRequestMock
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined);

        await db.localChanges.put(failing);

        await waitForExpect(() => expect(changeRequestMock).toHaveBeenCalledTimes(3));
        expect(await db.localChanges.get(failing.id)).toBeDefined();

        // New mutation -> watcher fires -> drain re-enters with a fresh attempt
        // counter; this time both acked.
        changeRequestMock
            .mockResolvedValueOnce(ack(20))
            .mockResolvedValueOnce(ack(21));

        await db.localChanges.put({
            id: 21,
            doc: { _id: "next", type: DocType.Post, updatedTimeUtc: 2 },
        } as ChangeReqDto);

        await waitForExpect(async () => {
            expect(await db.localChanges.count()).toBe(0);
        });
    });

    it("retries the failed item on reconnect", async () => {
        connect();
        await waitForExpect(() => expect(isConnected.value).toBe(true));

        const failing: ChangeReqDto = {
            id: 30,
            doc: { _id: "fail-r", type: DocType.Post, updatedTimeUtc: 1 },
        };
        // Burn through the cap so drain stops on its own.
        changeRequestMock
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined);

        await db.localChanges.put(failing);

        await waitForExpect(() => expect(changeRequestMock).toHaveBeenCalledTimes(3));
        expect(await db.localChanges.get(failing.id)).toBeDefined();

        // Disconnect then reconnect — the isConnected watcher should re-enter drain.
        getSocket().disconnect();
        await waitForExpect(() => expect(isConnected.value).toBe(false));

        changeRequestMock.mockResolvedValueOnce(ack(30));
        connect();

        await waitForExpect(async () => {
            expect(await db.localChanges.get(failing.id)).toBeUndefined();
        });
    });

    // --- Re-entrancy and concurrency ---

    it("does not start a concurrent drain when mutations land mid-flight", async () => {
        connect();
        await waitForExpect(() => expect(isConnected.value).toBe(true));

        let resolveFirst: (v: unknown) => void = () => {};
        changeRequestMock.mockImplementationOnce(
            () => new Promise((resolve) => (resolveFirst = resolve)),
        );

        const c1: ChangeReqDto = {
            id: 40,
            doc: { _id: "slow", type: DocType.Post, updatedTimeUtc: 1 },
        };
        await db.localChanges.put(c1);

        // Wait for the first push to be in flight.
        await waitForExpect(() => expect(changeRequestMock).toHaveBeenCalledTimes(1));

        // Queue another change while the first is still pending. The watcher
        // will fire but the running guard should keep us at one in-flight push.
        const c2: ChangeReqDto = {
            id: 41,
            doc: { _id: "follow", type: DocType.Post, updatedTimeUtc: 2 },
        };
        changeRequestMock.mockResolvedValueOnce(ack(41));
        await db.localChanges.put(c2);

        await wait(200);
        expect(changeRequestMock).toHaveBeenCalledTimes(1);

        // Release the first one — the c1 ack mutates the queue, refiring the
        // watcher, which drains c2.
        changeRequestMock.mockResolvedValueOnce(ack(40));
        resolveFirst(ack(40));

        await waitForExpect(async () => {
            expect(changeRequestMock).toHaveBeenCalledTimes(2);
            expect(await db.localChanges.count()).toBe(0);
        });
    });

    it("stops the drain loop when the connection drops mid-pass", async () => {
        connect();
        await waitForExpect(() => expect(isConnected.value).toBe(true));

        const c1: ChangeReqDto = {
            id: 50,
            doc: { _id: "p1", type: DocType.Post, updatedTimeUtc: 1 },
        };
        const c2: ChangeReqDto = {
            id: 51,
            doc: { _id: "p2", type: DocType.Post, updatedTimeUtc: 2 },
        };

        let resolveFirst: (v: unknown) => void = () => {};
        changeRequestMock.mockImplementationOnce(
            () => new Promise((resolve) => (resolveFirst = resolve)),
        );

        await db.localChanges.bulkPut([c1, c2]);

        await waitForExpect(() => expect(changeRequestMock).toHaveBeenCalledTimes(1));

        // Disconnect before the first request resolves; ack still arrives.
        getSocket().disconnect();
        await waitForExpect(() => expect(isConnected.value).toBe(false));

        resolveFirst(ack(50));

        // c1 is acked & removed, but c2 must NOT be pushed while offline.
        await waitForExpect(async () => {
            expect(await db.localChanges.get(50)).toBeUndefined();
        });
        await wait(200);
        expect(changeRequestMock).toHaveBeenCalledTimes(1);
        expect(await db.localChanges.get(51)).toBeDefined();
    });

    // --- Throw recovery: the running flag must reset on any exception ---

    it("recovers when the api call rejects (running flag resets)", async () => {
        connect();
        await waitForExpect(() => expect(isConnected.value).toBe(true));

        changeRequestMock.mockRejectedValueOnce(new Error("boom"));

        const c1: ChangeReqDto = {
            id: 60,
            doc: { _id: "throws", type: DocType.Post, updatedTimeUtc: 1 },
        };
        await db.localChanges.put(c1);

        // Wait for the throwing call to settle.
        await waitForExpect(() => expect(changeRequestMock).toHaveBeenCalledTimes(1));
        await wait(50);
        expect(await db.localChanges.get(60)).toBeDefined();

        // Next mutation must drive a new drain — that only works if the running
        // flag was reset by the finally block.
        changeRequestMock
            .mockResolvedValueOnce(ack(60))
            .mockResolvedValueOnce(ack(61));
        await db.localChanges.put({
            id: 61,
            doc: { _id: "after", type: DocType.Post, updatedTimeUtc: 2 },
        } as ChangeReqDto);

        await waitForExpect(async () => {
            expect(await db.localChanges.count()).toBe(0);
        });
    });

    it("recovers when applyLocalChangeAck rejects (running flag resets)", async () => {
        connect();
        await waitForExpect(() => expect(isConnected.value).toBe(true));

        const applySpy = vi
            .spyOn(db, "applyLocalChangeAck")
            .mockRejectedValueOnce(new Error("dexie blew up"));

        changeRequestMock.mockResolvedValueOnce(ack(70));
        const c1: ChangeReqDto = {
            id: 70,
            doc: { _id: "ack-throw", type: DocType.Post, updatedTimeUtc: 1 },
        };
        await db.localChanges.put(c1);

        await waitForExpect(() => expect(applySpy).toHaveBeenCalledTimes(1));
        await wait(50);

        // The first change is still in the queue because the ack write failed.
        expect(await db.localChanges.get(70)).toBeDefined();

        // After restoring normal behaviour, a new mutation must trigger drain
        // again — proving the running flag was reset by finally.
        applySpy.mockRestore();
        changeRequestMock
            .mockResolvedValueOnce(ack(70))
            .mockResolvedValueOnce(ack(71));

        await db.localChanges.put({
            id: 71,
            doc: { _id: "after-throw", type: DocType.Post, updatedTimeUtc: 2 },
        } as ChangeReqDto);

        await waitForExpect(async () => {
            expect(await db.localChanges.count()).toBe(0);
        });
    });

    // --- Idle conditions ---

    it("does nothing when there are no local changes", async () => {
        connect();
        await waitForExpect(() => expect(isConnected.value).toBe(true));

        await wait(200);
        expect(changeRequestMock).not.toHaveBeenCalled();
    });

    it("does nothing while offline even with queued changes", async () => {
        await db.localChanges.put({
            id: 80,
            doc: { _id: "offline-only", type: DocType.Post, updatedTimeUtc: 1 },
        } as ChangeReqDto);

        await wait(300);
        expect(changeRequestMock).not.toHaveBeenCalled();
        expect(await db.localChanges.get(80)).toBeDefined();
    });
});
