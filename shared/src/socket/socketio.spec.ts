import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi, afterAll, beforeAll } from "vitest";
import waitForExpect from "wait-for-expect";
import { getSocket, isConnected, maxUploadFileSize } from "./socketio";
import { Server } from "socket.io";
import { db } from "../db/database";
import { AckStatus, ChangeReqDto, DocType } from "../types";
import { accessMap } from "../permissions/permissions";
import { initLuminaryShared } from "../luminary";

vi.mock("../config/config", () => ({
    config: {
        apiUrl: "http://localhost:12345",
        isCms: true,
        maxUploadFileSize: 1234,
        setMaxUploadFileSize: vi.fn(),
    },
}));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("socketio", () => {
    const socketServer = new Server(12345);

    beforeAll(async () => {
        await initLuminaryShared({ cms: true, docsIndex: "parentId, language, [type+docType]" });

        // initialize the socket client
        const socket = getSocket({
            apiUrl: "http://localhost:12345",
        });
        socket.disconnect();
    });

    afterEach(() => {
        vi.clearAllMocks();
        getSocket().disconnect();
        socketServer.removeAllListeners();
    });

    afterAll(async () => {
        vi.restoreAllMocks();

        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("will not sync via the watcher if there the processChangeReqLock is on", async () => {
        // put more than 1 local change in the database

        // Mock the event listener from the server
        let changeReq;
        socketServer.on("connection", (socket) => {
            socket.on("changeRequest", (data) => {
                changeReq = data;
            });
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
        expect(changeReq.id).not.toEqual(1235);
    });

    it("will immediately sync when online", async () => {
        // Mock the event listener from the server
        let changeReq;
        socketServer.on("connection", (socket) => {
            socket.on("changeRequest", (data) => {
                changeReq = data;
            });
        });

        // Connect to the server
        getSocket({ reconnect: true });

        // Create a local change
        await db.localChanges.put({
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        });
        const localChange = await db.localChanges.get(1234);
        expect(localChange).toBeDefined();

        // Check if the server received the change request
        await waitForExpect(() => {
            expect(changeReq).toEqual(localChange);
        });
    });

    it("will start syncing when coming online after being offline", async () => {
        // Mock the event listener from the server
        let changeReq;
        socketServer.on("connection", (socket) => {
            socket.on("changeRequest", (data) => {
                changeReq = data;
            });
        });

        // Create a local change
        await db.localChanges.put({
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        });
        const localChange = await db.localChanges.get(1234);
        expect(localChange).toBeDefined();

        // check that the local change is not sent to the server
        await wait(1000);
        expect(changeReq).toBeUndefined();

        // Connect to the server
        getSocket({ reconnect: true });

        // Check if the server received the change request
        await waitForExpect(() => {
            expect(changeReq).toEqual(localChange);
        });
    });

    it("can connect to a socket server and set the connection status", async () => {
        let serverConnectCalled = false;
        socketServer.on("connection", () => {
            serverConnectCalled = true;
        });

        expect(isConnected.value).toEqual(false); // Should be false immediately after creating the instance

        getSocket({ reconnect: true });

        await waitForExpect(() => {
            expect(serverConnectCalled).toEqual(true);
            expect(isConnected.value).toEqual(true);
        });
    });

    it("can force reload the connection", async () => {
        let serverConnectCalled = false;
        socketServer.on("connection", () => {
            serverConnectCalled = true;
        });

        getSocket({ reconnect: true });

        await waitForExpect(() => {
            expect(serverConnectCalled).toEqual(true);
            expect(isConnected.value).toEqual(true);
        });

        serverConnectCalled = false;
        getSocket({ reconnect: true }).reconnect();
        expect(isConnected.value).toEqual(false);

        await waitForExpect(() => {
            expect(serverConnectCalled).toEqual(true);
            expect(isConnected.value).toEqual(true);
        });
    });

    it("sends a change request if there are local changes", async () => {
        let changeReq;
        socketServer.on("connection", (socket) => {
            socket.on("changeRequest", (data) => {
                changeReq = data;
            });
        });
        getSocket({ reconnect: true });

        const localChange: ChangeReqDto = {
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        };
        await db.localChanges.put(localChange);

        await waitForExpect(() => {
            expect(changeReq).toEqual(localChange);
        });
    });

    it("handles acks for changes", async () => {
        // Create a local change
        await db.localChanges.put({
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        });
        const localChange = await db.localChanges.get(1234);
        expect(localChange).toBeDefined();

        // Mock the ack from the server
        socketServer.on("connection", (socket) => {
            socket.emit("changeRequestAck", { id: 1234, ack: AckStatus.Accepted });
        });

        getSocket({ reconnect: true });

        await waitForExpect(async () => {
            // Check if the local change was removed
            const res = await db.localChanges.get(1234);
            expect(res).toBeUndefined();
        });
    });

    it("can receive and apply a clientConfig message from the server", async () => {
        const clientConfig = {
            accessMap: {
                group1: {
                    [DocType.Post]: {
                        view: true,
                        assign: true,
                    },
                },
            },
            maxUploadFileSize: 1234,
        };

        socketServer.on("connection", (socket) => {
            socket.emit("clientConfig", clientConfig);
        });

        getSocket({ reconnect: true });

        await waitForExpect(() => {
            expect(accessMap.value).toEqual(clientConfig.accessMap);
            expect(maxUploadFileSize.value).toEqual(clientConfig.maxUploadFileSize);
        });
    });
});
