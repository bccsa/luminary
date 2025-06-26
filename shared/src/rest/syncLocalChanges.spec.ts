import "fake-indexeddb/auto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { AckStatus, ChangeReqDto, DocType } from "../types";
import { db, initDatabase } from "../db/database";
import { getSocket } from "../socket/socketio";
import { initConfig } from "../config";
import { Server } from "socket.io";
import waitForExpect from "wait-for-expect";
import * as RestApi from "../rest/RestApi";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const changeRequestMock = vi.fn();
vi.spyOn(RestApi, "getRest").mockReturnValue({
    changeRequest: changeRequestMock,
} as unknown as any);

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

    it("sends a change request if there are local changes", async () => {
        socketServer.on("connection", (socket) => {
            socket.emit("clientConfig", {});
        });

        getSocket({ reconnect: true });

        const localChange: ChangeReqDto = {
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        };

        await db.localChanges.put(localChange);

        await waitForExpect(() => {
            expect(changeRequestMock).toHaveBeenCalled();

            const formData = changeRequestMock.mock.calls[0][0] as any;

            const entries = [...formData.entries()];
            expect(entries).toEqual(
                expect.arrayContaining([
                    ["changeRequestId", "1234"],
                    [
                        "changeRequestDoc-JSON",
                        JSON.stringify({ _id: "test-doc", type: "post", updatedTimeUtc: 1234 }),
                    ],
                ]),
            );
        });
    });

    it("handles acks for changes", async () => {
        vi.spyOn(RestApi.getRest(), "changeRequest").mockResolvedValueOnce({
            id: 1234,
            ack: AckStatus.Accepted,
        });

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
        await db.localChanges.put(localChange);

        // Check if the server received the change request
        await waitForExpect(() => {
            expect(changeRequestMock).toHaveBeenCalled();

            const formData = changeRequestMock.mock.calls[0][0] as any;
            const entries = [...formData.entries()];
            expect(entries).toEqual(
                expect.arrayContaining([
                    ["changeRequestId", localChange.id.toString()],
                    ["changeRequestDoc-JSON", JSON.stringify(localChange.doc)],
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
        await db.localChanges.put(localChange);
        const stored = await db.localChanges.get(1234);
        expect(stored).toBeDefined();

        // Ensure not synced before connecting
        await wait(500);
        expect(changeRequestMock).not.toHaveBeenCalled();

        // Now connect
        getSocket({ reconnect: true });

        // Wait and validate sync
        await waitForExpect(() => {
            expect(changeRequestMock).toHaveBeenCalled();

            const formData = changeRequestMock.mock.calls[0][0] as any;
            const entries = [...formData.entries()];
            expect(entries).toEqual(
                expect.arrayContaining([
                    ["changeRequestId", localChange.id.toString()],
                    ["changeRequestDoc-JSON", JSON.stringify(localChange.doc)],
                ]),
            );
        });
    });

    it("will not sync via the watcher if there the processChangeReqLock is on", async () => {
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
        expect(changeRequestMock).not.toHaveBeenCalledWith({ id: 1235 });
    });
});
