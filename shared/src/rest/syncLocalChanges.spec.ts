import "fake-indexeddb/auto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { AckStatus, ChangeReqDto, DocType, LocalChangeDto } from "../types";
import { db, initDatabase } from "../db/database";
import { getSocket } from "../socket/socketio";
import { initConfig } from "../config";
import { Server } from "socket.io";
import waitForExpect from "wait-for-expect";
import * as RestApi from "../rest/RestApi";
import { useDexieLiveQuery } from "../util";
import { processChangeReqLock, syncLocalChanges } from "./syncLocalChanges";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const changeRequestMock = vi.fn();

describe("localChanges", () => {
    const socketServer = new Server(12344);

    beforeAll(async () => {
        initConfig({
            cms: true,
            docsIndex: "parentId, language, [type+docType]",
            syncList: [
                {
                    type: DocType.Tag,
                    syncPriority: 2,
                    skipWaitForLanguageSync: true,
                },
                {
                    type: DocType.Post,
                    syncPriority: 2,
                    skipWaitForLanguageSync: true,
                },
                {
                    type: DocType.Redirect,
                    syncPriority: 2,
                    skipWaitForLanguageSync: true,
                },
                {
                    type: DocType.Language,
                    syncPriority: 1,
                    skipWaitForLanguageSync: true,
                },
                {
                    type: DocType.Group,
                    syncPriority: 1,
                    skipWaitForLanguageSync: true,
                },
                {
                    type: DocType.User,
                    sync: false,
                },
            ],
            apiUrl: "http://localhost:12344",
            appLanguageIdsAsRef: ref([]),
        });

        // Initialize the IndexedDB database
        await initDatabase();

        // initialize the socket client
        const socket = getSocket();

        vi.spyOn(RestApi, "getRest").mockReturnValue({
            changeRequest: changeRequestMock,
        } as unknown as any);

        // Initialize syncLocalChanges since we're mocking getRest()
        const localChanges = useDexieLiveQuery(
            () => db.localChanges.toArray() as unknown as Promise<LocalChangeDto[]>,
            { initialValue: [] as unknown as LocalChangeDto[] },
        );
        syncLocalChanges(localChanges);

        socket.disconnect();
    });

    afterEach(async () => {
        vi.clearAllMocks();
        getSocket().disconnect();
        socketServer.removeAllListeners();

        await db.docs.clear();
        await db.localChanges.clear();
    });

    afterAll(async () => {
        vi.restoreAllMocks();

        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    // No global lock mutation; let implementation manage it.

    it("sends a change request if there are local changes", async () => {
        // Simulate server connection
        socketServer.on("connection", (socket) => {
            socket.emit("clientConfig", {});
        });
        getSocket({ reconnect: true });

        // Add a local change
        const localChange = {
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        };

        // Ack response so item removed
        changeRequestMock.mockResolvedValueOnce({ id: 1234, ack: AckStatus.Accepted });

        await db.localChanges.put(localChange);

        // Assert that the changeRequestMock was called with the correct data
        await waitForExpect(async () => {
            expect(changeRequestMock).toHaveBeenCalled();

            const formData = changeRequestMock.mock.calls[0][0] as FormData;
            const entries = [...formData.entries()];
            expect(entries).toEqual(
                expect.arrayContaining([
                    [
                        "changeRequest-JSON",
                        JSON.stringify({
                            id: 1234,
                            doc: { _id: "test-doc", type: "post", updatedTimeUtc: 1234 },
                        }),
                    ],
                ]),
            );
        });
    });

    it("handles acks for changes", async () => {
        changeRequestMock.mockResolvedValueOnce({ id: 1234, ack: AckStatus.Accepted });

        // Create a local change
        await db.localChanges.put({
            docId: "",
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        });
        const localChange = await db.localChanges.get(1234);
        expect(localChange).toBeDefined();

        // Mock the ack from the server
        socketServer.on("connection", (socket) => {
            socket.emit("clientConfig", {});
        });

        getSocket({ reconnect: true });

        await waitForExpect(async () => {
            // Check if the local change was removed
            const res = await db.localChanges.get(1234);
            expect(res).toBeUndefined();
            expect(await db.localChanges.count()).toBe(0);
        });
    });

    it("will immediately sync when online", async () => {
        socketServer.on("connection", (socket) => {
            socket.emit("clientConfig", {});
        });

        // Connect to the server
        getSocket({ reconnect: true });

        const localChange = {
            docId: "1234",
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        };

        // Create a local change
        changeRequestMock.mockResolvedValueOnce({ id: localChange.id, ack: AckStatus.Accepted });
        await db.localChanges.put(localChange);

        await waitForExpect(async () => {
            expect(changeRequestMock).toHaveBeenCalled();
            expect(await db.localChanges.count()).toBe(0);
        });

        // Check if the server received the change request
        await waitForExpect(async () => {
            const formData = changeRequestMock.mock.calls[0][0] as any;
            const entries = [...formData.entries()];
            expect(entries).toEqual(
                expect.arrayContaining([
                    ["changeRequest-JSON", JSON.stringify(localChange)],
                ]),
            );
        });
    });

    it("will start syncing when coming online after being offline", async () => {
        socketServer.on("connection", (socket) => {
            socket.emit("clientConfig", {});
        });

        const localChange = {
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        };

        // Store while offline
        changeRequestMock.mockResolvedValueOnce({ id: localChange.id, ack: AckStatus.Accepted });
        await db.localChanges.put(localChange);
        const stored = await db.localChanges.get(1234);
        expect(stored).toBeDefined();

        // Ensure not synced before connecting
        await wait(500);
        expect(changeRequestMock).not.toHaveBeenCalled();

        // Now connect
        getSocket({ reconnect: true });

        // Wait and validate sync
        await waitForExpect(async () => {
            expect(changeRequestMock).toHaveBeenCalled();

            const formData = changeRequestMock.mock.calls[0][0] as any;
            const entries = [...formData.entries()];
            expect(entries).toEqual(
                expect.arrayContaining([
                    ["changeRequest-JSON", JSON.stringify(localChange)],
                ]),
            );
            expect(await db.localChanges.count()).toBe(0);
        });
    });

    it("will not sync via the watcher if the processChangeReqLock is on", async () => {
        socketServer.on("connection", (socket) => {
            socket.emit("clientConfig", {});
        });

        // Connect to the server
        getSocket({ reconnect: true });

        // Create multiple local changes
        const localChange1: ChangeReqDto = {
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        };
        const localChange2: ChangeReqDto = {
            id: 1235,
            doc: { _id: "test-doc2", type: DocType.Post, updatedTimeUtc: 1234 },
        };
        await db.localChanges.bulkPut([localChange1, localChange2]);

        // Check that the server should not receive the second localChange, but only the first
        await wait(2000);
        await waitForExpect(async () => {
            expect(changeRequestMock).not.toHaveBeenCalledWith({ id: 1235 });
        });
    });

    it("syncs pending offline change after reconnect via lock dependency re-run", async () => {
        // Arrange: simulate prior state with lock engaged while offline
        getSocket().disconnect();
        processChangeReqLock.value = true;

        const localChange = {
            id: 7777,
            doc: { _id: "race-doc", type: DocType.Post, updatedTimeUtc: Date.now() },
        } as ChangeReqDto;
        changeRequestMock.mockResolvedValueOnce({ id: localChange.id, ack: AckStatus.Accepted });
        await db.localChanges.put(localChange);
        expect(await db.localChanges.get(localChange.id)).toBeDefined();

        // Act: reconnect (isConnected watcher unlocks; combined watcher observes lock change)
        socketServer.on("connection", (socket) => {
            socket.emit("clientConfig", {});
        });
        getSocket({ reconnect: true });

        await waitForExpect(async () => {
            expect(changeRequestMock).toHaveBeenCalled();
            const formData = changeRequestMock.mock.calls[0][0] as FormData;
            const entries = [...formData.entries()];
            expect(entries).toEqual(
                expect.arrayContaining([
                    ["changeRequest-JSON", JSON.stringify(localChange)],
                ]),
            );
            expect(await db.localChanges.count()).toBe(0);
        });
    });
});
