import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi, afterAll, beforeAll } from "vitest";
import { flushPromises } from "@vue/test-utils";
import waitForExpect from "wait-for-expect";
import { mockEnglishContentDto, mockPostDto } from "../../../mockdata";
import { getSocket, isConnected, maxUploadFileSize } from "./socketio";
import { Server } from "socket.io";
import { db } from "../db/database";
import { AckStatus, ChangeReqDto, DocType } from "../types";
import { accessMap } from "../permissions/permissions";

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

    beforeAll(() => {
        // initialize the socket client
        const socket = getSocket({
            apiUrl: "http://localhost:12345",
            cms: true,
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

    it("will not sync via the watcher if there are multiple changes when online", async () => {
        // This test needs to be executed first, as it relies on the socket class not being instantiated
        // put more than 1 local change in the database without triggering the watcher

        // Mock the event listener from the server
        let changeReq;
        socketServer.on("connection", (socket) => {
            socket.on("changeRequest", (data) => {
                changeReq = data;
            });
        });
        // force the connection status to true to prevent the watcher from syncing immediately;
        isConnected.value = true;

        // Connect to the server
        getSocket({ reconnect: true });

        // Wait for the connection to be established
        await waitForExpect(() => {
            isConnected.value = true;
        });

        flushPromises();

        // Create multiple local changes
        await db.localChanges.bulkPut([
            {
                id: 1234,
                doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
            },
            {
                id: 1235,
                doc: { _id: "test-doc2", type: DocType.Post, updatedTimeUtc: 1234 },
            },
        ]);

        // Check that the server should not receive a change request.
        await wait(1000);
        expect(changeReq).toBeUndefined();
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

    it("can set the sync version", async () => {
        localStorage.setItem("syncVersion", "0");
        await waitForExpect(() => {
            expect(db.syncVersion).toBe(0);
        });

        socketServer.on("connection", (socket) => {
            socket.emit("data", { docs: [], version: 42 });
        });
        getSocket({ reconnect: true });

        await waitForExpect(() => {
            expect(db.syncVersion).toBe(42);
            expect(localStorage.getItem("syncVersion")).toBe("42");
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

    it("emits a clientDataReq after connecting", async () => {
        let clientDataReq;
        socketServer.on("connection", (socket) => {
            socket.on("clientDataReq", (data) => {
                clientDataReq = data;
            });
        });

        getSocket({ reconnect: true });

        let lastUpdatedTime = localStorage.getItem("syncVersion");
        if (typeof lastUpdatedTime !== "string") lastUpdatedTime = "0";

        await waitForExpect(() => {
            expect(clientDataReq).toEqual({
                accessMap: {},
                version: Number.parseInt(lastUpdatedTime),
                cms: true,
            });
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

    it("can manually request data from the api", async () => {
        getSocket({ reconnect: true });

        let lastUpdatedTime = localStorage.getItem("syncVersion");
        if (typeof lastUpdatedTime !== "string") lastUpdatedTime = "0";

        let clientDataReq;
        socketServer.on("connection", (socket) => {
            socket.on("clientDataReq", (data) => {
                clientDataReq = data;
            });
        });

        await waitForExpect(() => {
            expect(clientDataReq).toEqual({
                accessMap: {},
                version: Number.parseInt(lastUpdatedTime),
                cms: true,
            });
        });
    });

    it("saves data from the API and sets the syncVersion", async () => {
        socketServer.on("connection", (socket) => {
            socket.emit("data", { docs: [mockPostDto, mockEnglishContentDto], version: 42 });
        });
        getSocket({ reconnect: true });

        await waitForExpect(async () => {
            const result = await db.docs.toArray();
            expect(result.find((r) => r._id == mockPostDto._id)).toEqual(mockPostDto);
            expect(result.find((r) => r._id == mockEnglishContentDto._id)).toEqual(
                mockEnglishContentDto,
            );
        });

        expect(localStorage.getItem("syncVersion")).toEqual("42");
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
