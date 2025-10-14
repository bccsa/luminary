import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi, afterAll, beforeAll } from "vitest";
import waitForExpect from "wait-for-expect";
import { getSocket, isConnected, maxUploadFileSize, maxMediaUploadFileSize } from "./socketio";
import { Server } from "socket.io";
import { db, initDatabase } from "../db/database";
import { DocType } from "../types";
import { accessMap } from "../permissions/permissions";
import { config, initConfig } from "../config";
import { ref } from "vue";
import * as RestApi from "../rest/RestApi";

const changeRequestMock = vi.fn();
vi.spyOn(RestApi, "getRest").mockReturnValue({
    changeRequest: changeRequestMock,
} as unknown as any);

describe("socketio", () => {
    const socketServer = new Server(12345);

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

            const mockDocTypes: RestApi.ApiSyncQuery[] = [
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
                { type: DocType.Post, contentOnly: false, sync: true } as RestApi.ApiSyncQuery,
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
