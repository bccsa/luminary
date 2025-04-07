import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi, afterAll, beforeAll } from "vitest";
import waitForExpect from "wait-for-expect";
import { getSocket, isConnected, maxUploadFileSize } from "./socketio";
import { Server } from "socket.io";
import { db, initDatabase } from "../db/database";
import { AckStatus, ChangeReqDto, DocType } from "../types";
import { accessMap } from "../permissions/permissions";
import { config, initConfig } from "../config";
import { ref } from "vue";
import { ApiSyncQuery } from "../rest/RestApi";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("socketio", () => {
    const socketServer = new Server(12345);

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

    it("will not sync via the watcher if there the processChangeReqLock is on", async () => {
        // put more than 1 local change in the database

        // Mock the event listener from the server
        let changeReq;
        socketServer.on("connection", (socket) => {
            socket.on("changeRequest", (data) => {
                changeReq = data;
            });
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
        expect(changeReq.id).not.toEqual(1235);
    });

    it("will immediately sync when online", async () => {
        // Mock the event listener from the server
        let changeReq;
        socketServer.on("connection", (socket) => {
            socket.on("changeRequest", (data) => {
                changeReq = data;
            });
            socket.emit("clientConfig", {});
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
            socket.emit("clientConfig", {});
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

    it("sends a change request if there are local changes", async () => {
        let changeReq;
        socketServer.on("connection", (socket) => {
            socket.on("changeRequest", (data) => {
                changeReq = data;
            });
            socket.emit("clientConfig", {});
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
            socket.emit("clientConfig", {});
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

    describe("socket.io data event filtering", () => {
        it("filters data based on docTypes and language IDs", async () => {
            const mockData = {
                docs: [
                    { type: DocType.Post, _id: "doc1" },
                    {
                        type: DocType.Content,
                        _id: "doc2",
                        parentType: DocType.Post,
                        language: "en",
                    },
                    {
                        type: DocType.Content,
                        _id: "doc3",
                        parentType: DocType.Post,
                        language: "fr",
                    },
                    { type: DocType.DeleteCmd, _id: "doc4" },
                    { type: DocType.Group, _id: "doc5" },
                    { type: DocType.User, _id: "doc6" },
                ],
            };

            const mockDocTypes: ApiSyncQuery[] = [
                { type: DocType.Post, contentOnly: false, syncPriority: 1, sync: true },
                { type: DocType.User, sync: false },
            ];

            config.appLanguageIdsAsRef!.value = ["en"];
            config.syncList = mockDocTypes;

            socketServer.on("connection", (socket) => {
                socket.emit("data", mockData);
            });

            getSocket({ reconnect: true });

            await waitForExpect(async () => {
                const docs = await db.docs.toArray();
                expect(docs.length).toEqual(2);
                expect(docs[0].type).toEqual(DocType.Post);
                expect(docs[1].type).toEqual(DocType.Content);
                expect(docs[1].language).toEqual("en");
                // The delete command is not added to the database as it is removed in the db.bulkPut function
            });
        });

        it("includes all content documents if no language filter is set", async () => {
            const mockData = {
                docs: [
                    { type: DocType.Post, _id: "doc1" },
                    {
                        type: DocType.Content,
                        _id: "doc2",
                        parentType: DocType.Post,
                        language: "en",
                    },
                    {
                        type: DocType.Content,
                        _id: "doc3",
                        parentType: DocType.Post,
                        language: "fr",
                    },
                ],
            };

            const mockDocTypes = [
                { type: DocType.Post, contentOnly: false, sync: true } as ApiSyncQuery,
            ];

            config.appLanguageIdsAsRef!.value = [];
            config.syncList = mockDocTypes;

            socketServer.on("connection", (socket) => {
                socket.emit("data", mockData);
            });

            getSocket({ reconnect: true });

            await waitForExpect(async () => {
                const docs = await db.docs.toArray();
                expect(docs.length).toEqual(3);
                expect(docs[0].type).toEqual(DocType.Post);
                expect(docs[1].type).toEqual(DocType.Content);
                expect(docs[1].language).toEqual("en");
                expect(docs[2].type).toEqual(DocType.Content);
                expect(docs[2].language).toEqual("fr");
            });
        });
    });
});
