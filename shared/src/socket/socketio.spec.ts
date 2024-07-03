import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from "vitest";
import waitForExpect from "wait-for-expect";
import { mockEnglishContentDto, mockPostDto } from "../tests/mockData";
import { Socketio } from "./socketio";
import { Server } from "socket.io";
import { db } from "../db/database";
import { AckStatus, ChangeReqDto, DocType } from "../types";
import { accessMap } from "../permissions/permissions";
import { config } from "../config/config";

vi.mock("../config/config", () => ({
    config: {
        apiUrl: "http://localhost:12345",
        isCms: true,
        maxUploadFileSize: 1234,
        setMaxUploadFileSize: vi.fn(),
    },
}));

describe("socketio", () => {
    const socketServer = new Server(12345);

    beforeEach(() => {});

    afterEach(() => {
        vi.clearAllMocks();
        socketServer.removeAllListeners();
    });

    afterAll(async () => {
        vi.restoreAllMocks();

        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("can connect to a socket server and set the connection status", async () => {
        let serverConnectCalled = false;
        socketServer.on("connection", () => {
            serverConnectCalled = true;
        });

        const socketClient = new Socketio();
        expect(socketClient.isConnected.value).toEqual(false); // Should be false immediately after creating the instance

        await waitForExpect(() => {
            expect(serverConnectCalled).toEqual(true);
            expect(socketClient.isConnected.value).toEqual(true);
        });
    });

    it("emits a clientDataReq after connecting", async () => {
        let clientDataReq;
        socketServer.on("connection", (socket) => {
            socket.on("clientDataReq", (data) => {
                clientDataReq = data;
            });
        });

        new Socketio();

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

        const socketClient = new Socketio();

        await waitForExpect(() => {
            expect(serverConnectCalled).toEqual(true);
            expect(socketClient.isConnected.value).toEqual(true);
        });

        serverConnectCalled = false;
        socketClient.reconnect();
        expect(socketClient.isConnected.value).toEqual(false);

        await waitForExpect(() => {
            expect(serverConnectCalled).toEqual(true);
            expect(socketClient.isConnected.value).toEqual(true);
        });
    });

    it("can manually request data from the api", async () => {
        new Socketio();

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
        new Socketio();

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
        new Socketio();

        const localChange: ChangeReqDto = {
            id: 1234,
            doc: { _id: "test-doc", type: DocType.Post, updatedTimeUtc: 1234 },
        };
        await db.localChanges.add(localChange);

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

        // Create a new socket client
        new Socketio();

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

        new Socketio();

        await waitForExpect(() => {
            expect(accessMap.value).toEqual(clientConfig.accessMap);
            expect(config.maxUploadFileSize).toEqual(clientConfig.maxUploadFileSize);
        });
    });
});
