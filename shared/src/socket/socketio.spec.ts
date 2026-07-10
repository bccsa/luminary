import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi, afterAll, beforeAll } from "vitest";
import waitForExpect from "wait-for-expect";
import { getSocket, isConnected, maxUploadFileSize, maxMediaUploadFileSize } from "./socketio";
import { Server } from "socket.io";
import { db, initDatabase } from "../db/database";
import { DocType } from "../types";
import { accessMap } from "../permissions/permissions";
import { initConfig } from "../config";
import { ref } from "vue";
import * as RestApi from "../api/RestApi";

const changeRequestMock = vi.fn();
vi.spyOn(RestApi, "getRest").mockReturnValue({
    changeRequest: changeRequestMock,
} as unknown as any);

describe("socketio", () => {
    const socketServer = new Server(12345);

    function foregroundDocument() {
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
    }

    beforeAll(async () => {
        initConfig({
            cms: true,
            docsIndex: "parentId, language, [type+docType]",
            apiUrl: "http://localhost:12345",
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

    it("can connect to a socket server and set the connection status", async () => {
        let serverConnectCalled = false;
        socketServer.on("connection", (socket) => {
            serverConnectCalled = true;
            socket.emit("clientConfig", {});
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
        socketServer.on("connection", (socket) => {
            serverConnectCalled = true;
            socket.emit("clientConfig", {});
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

    it("reconnects when a disconnected tab becomes visible", async () => {
        let serverConnectCalled = false;
        socketServer.on("connection", (socket) => {
            serverConnectCalled = true;
            socket.emit("clientConfig", {});
        });

        getSocket().disconnect();
        foregroundDocument();

        await waitForExpect(() => {
            expect(serverConnectCalled).toEqual(true);
            expect(isConnected.value).toEqual(true);
        });
    });

    it("does not start duplicate foreground reconnects while a handshake is pending", async () => {
        let connectionCount = 0;
        socketServer.on("connection", () => {
            connectionCount += 1;
        });

        getSocket().disconnect();
        foregroundDocument();
        foregroundDocument();

        await waitForExpect(() => {
            expect(connectionCount).toEqual(1);
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(connectionCount).toEqual(1);
    });

    it("allows a later foreground retry after the pending connection disconnects", async () => {
        let connectionCount = 0;
        socketServer.on("connection", (socket) => {
            connectionCount += 1;
            if (connectionCount === 1) socket.disconnect(true);
            else socket.emit("clientConfig", {});
        });

        getSocket().disconnect();
        foregroundDocument();

        await waitForExpect(() => {
            expect(connectionCount).toEqual(1);
            expect(isConnected.value).toEqual(false);
        });

        foregroundDocument();
        await waitForExpect(() => {
            expect(connectionCount).toEqual(2);
            expect(isConnected.value).toEqual(true);
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
            maxMediaUploadFileSize: 5678,
        };

        socketServer.on("connection", (socket) => {
            socket.emit("clientConfig", clientConfig);
        });

        getSocket({ reconnect: true });

        await waitForExpect(() => {
            expect(accessMap.value).toEqual(clientConfig.accessMap);
            expect(maxUploadFileSize.value).toEqual(clientConfig.maxUploadFileSize);
            expect(maxMediaUploadFileSize.value).toEqual(clientConfig.maxMediaUploadFileSize);
        });
    });

    // NOTE: the live-update persistence path (filter → retention gate → bulkPut) moved
    // to the sync live persister — its tests live in `api/sync/liveSync.spec.ts`.
    // Socket.io is now a pure transport; only its connection lifecycle is tested here.
});
