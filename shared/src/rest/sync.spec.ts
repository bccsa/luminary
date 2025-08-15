import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi, afterAll, beforeAll } from "vitest";
import { db, initDatabase, SyncMap, syncMap } from "../db/database";
import { DocType } from "../types";
import { accessMap } from "../permissions/permissions";
import { getRest } from "./RestApi";
import { Sync, syncActive } from "./sync";
import express from "express";
import { ApiSearchQuery } from "./RestApi";
import waitForExpect from "wait-for-expect";
import { ref } from "vue";
import { isEqual } from "lodash-es";
import { config, initConfig } from "../config";
import { isConnected } from "../socket/socketio";
import { mockFrenchContentDto, mockLanguageDtoFra } from "../tests/mockdata";

const app = express();
const port = 12349;
let sync;
let mockApiRequest;
let apiRecursiveTest = { types: [""], groups: [""], contentOnly: false }; // update parameters to run a recursive test on a specific doctype group
let mockApiCheckFor = (res: any) => {
    return res;
};
let mockApiCheckForRes;

const timeout = (val) => new Promise((resolve) => setTimeout(resolve, val));

// ============================
// Mock data
// ============================
const mockApiResponse = {
    docs: [],
    types: ["tag"],
    warnings: "",
    blockStart: 4000,
    blockEnd: 3000,
    groups: ["group-super-admins"],
    contentOnly: true,
};

const mockApiRecursiveResponse = [
    {
        docs: [],
        types: ["post"],
        warnings: "",
        blockStart: 2300,
        blockEnd: 2000,
        groups: ["group-recursive-test"],
        contentOnly: false,
    },
    {
        docs: [],
        types: ["post"],
        warnings: "",
        blockStart: 2700,
        blockEnd: 2300,
        groups: ["group-recursive-test"],
        contentOnly: false,
    },
    {
        docs: [],
        types: ["post"],
        warnings: "",
        blockStart: 3000,
        blockEnd: 2700,
        groups: ["group-recursive-test"],
        contentOnly: false,
    },
];

const syncMapEntry: SyncMap = {
    id: "post_group-super-admins",
    types: [DocType.Post],
    contentOnly: false,
    groups: ["group-super-admins"],
    languages: ["lang-eng"],
    syncPriority: 1,
    blocks: [
        {
            blockStart: 700,
            blockEnd: 500,
        },
        {
            blockStart: 2000,
            blockEnd: 1000,
        },
        {
            blockStart: 0,
            blockEnd: 0,
        },
    ],
};

// ============================
// Mock api
// ============================
app.get("/search", (req, res) => {
    mockApiRequest = req.headers["x-query"];
    const a = apiRecursiveTest;
    const b = JSON.parse(mockApiRequest);

    mockApiCheckFor(b);

    res.setHeader("Content-Type", "application/json");
    res.end(
        JSON.stringify(
            isEqual(a.types, b.types) &&
                isEqual(a.groups, b.groups) &&
                a.contentOnly == b.contentOnly &&
                mockApiRecursiveResponse.length > 0
                ? mockApiRecursiveResponse.pop()
                : mockApiResponse,
        ),
    );
});

app.listen(port, () => {
    console.log(`Mock api running on port ${port}.`);
});

// ============================
// Tests
// ============================
describe("rest", () => {
    beforeAll(async () => {
        accessMap.value["group-super-admins"] = {
            post: { view: true, edit: true, delete: true, translate: true, publish: true },
        };
        accessMap.value["group-recursive-test"] = {
            post: { view: true, edit: true, delete: true, translate: true, publish: true },
        };

        initConfig({
            cms: true,
            docsIndex: "parentId, language, [type+docType]",
            apiUrl: "http://127.0.0.1:" + port,
            appLanguageIdsAsRef: ref(["lang-eng"]),
            syncList: [
                {
                    type: DocType.Post,
                    contentOnly: true,
                    syncPriority: 10,
                    sync: true,
                },
                {
                    type: DocType.Post,
                    contentOnly: false,
                    syncPriority: 10,
                    sync: true,
                },
                {
                    type: DocType.Group,
                    contentOnly: false,
                    syncPriority: 10,
                    sync: true,
                },
                {
                    type: DocType.Language,
                    contentOnly: false,
                    syncPriority: 9,
                    skipWaitForLanguageSync: true,
                    sync: true,
                },
            ],
        });

        await initDatabase();
        isConnected.value = true;
        getRest();
        sync = new Sync();

        apiRecursiveTest = { types: [""], groups: [""], contentOnly: false };
        mockApiRequest = "";

        mockApiCheckFor = (res: any) => {
            return res;
        };

        syncMap.value.clear();
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await db.luminaryInternals.clear();
        syncMap.value.clear();
    });

    afterAll(async () => {
        vi.restoreAllMocks();

        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    describe("sync", () => {
        it("can correctly query the api", async () => {
            const query: ApiSearchQuery = {
                apiVersion: "0.0.0",
                from: 0,
                types: [DocType.Post],
                groups: ["group-public-content"],
            };
            await sync.req(query);

            // await waitForExpect(() => {
            expect(mockApiRequest).toBe(JSON.stringify(query));
            // });
        });

        it("can start sync", async () => {
            syncMap.value.set("test-start-sync", syncMapEntry);

            mockApiCheckFor = (res) => {
                if (isEqual(res.types, ["post"]) && isEqual(res.groups, ["group-super-admins"]))
                    mockApiCheckForRes = res;
            };

            await sync.restart();

            await waitForExpect(() => {
                const req = mockApiCheckForRes;
                expect(isEqual(req.types, ["post"])).toBe(true);
                expect(isEqual(req.groups, ["group-super-admins"])).toBe(true);
                expect(req.includeDeleteCmds).toBe(true);
            });
        });

        it("will only request delete commands if it is not the initial sync", async () => {
            mockApiCheckFor = (res) => {
                if (isEqual(res.types, ["post"])) mockApiCheckForRes = res;
            };

            syncMap.value.clear();
            sync.restart();

            // Wait for the sync to restart and calculate the syncMap
            await timeout(500);

            await waitForExpect(() => {
                const req = mockApiCheckForRes;
                expect(req && req.includeDeleteCmds).toBeUndefined();
            });

            const _sm = Object.fromEntries(syncMap.value);
            Object.values(_sm).forEach((e: any) => {
                e.blocks.push({ blockStart: 100, blockEnd: 200 });
            });

            sync.restart();

            await waitForExpect(() => {
                const req = mockApiCheckForRes;
                expect(req && req.includeDeleteCmds).toBe(true);
            });
        });

        // This test tests the recursion of the sync, but actually test much deeper, It also tests mergeBlocks, insertBlocks, processQueue, calcMissingData,
        it("can query the api recursively", async () => {
            accessMap.value["group-recursive-test"] = {
                post: { view: true, edit: true, delete: true, translate: true, publish: true },
            };
            syncMap.value.clear();
            syncMap.value.set("post_group-recursive-test", {
                ...syncMapEntry,
                id: "post_group-recursive-test",
                groups: ["group-recursive-test"],
                types: [DocType.Post],
                syncPriority: 10,
                blocks: [
                    { blockStart: 20000, blockEnd: 3000 },
                    { blockStart: 2000, blockEnd: 1000 },
                ],
            });
            apiRecursiveTest = {
                types: ["post"],
                groups: ["group-recursive-test"],
                contentOnly: false,
            };
            await sync.start();

            await waitForExpect(() => {
                const _sm = Object.fromEntries(syncMap.value);
                const post = Object.values(_sm).find((e: any) =>
                    e.groups.includes("group-recursive-test"),
                );
                expect(post?.blocks[0].blockStart).toBe(4000);
                expect(post?.blocks[0].blockEnd).toBe(3000);
            }, 9000);
        }, 10000);

        it("can start sync when the accessMap is updated", async () => {
            const spy = vi.spyOn(sync, "start");

            accessMap.value["group-public-users"] = {
                post: { view: true, edit: true, delete: true, translate: true, publish: true },
            };

            await waitForExpect(async () => {
                expect(spy).toHaveBeenCalled();
            });
        });

        it("can start sync when the client is connected on Socket.io", async () => {
            isConnected.value = false;

            const spy = vi.spyOn(sync, "start");

            isConnected.value = true;

            await waitForExpect(async () => {
                expect(spy).toHaveBeenCalled();
            });
        });

        it("deletes unrelated content documents when a language is removed from the user's preferred language list", async () => {
            config.appLanguageIdsAsRef!.value = ["lang-eng", "lang-fra"];
            await db.docs.bulkPut([mockFrenchContentDto]);

            const docFra = await db.docs.get(mockFrenchContentDto._id);
            expect(docFra).toBeDefined();

            config.appLanguageIdsAsRef!.value = ["lang-eng"];

            await waitForExpect(async () => {
                const remainingDocs = await db.docs.toArray();
                expect(remainingDocs.some((doc) => doc.language === mockLanguageDtoFra._id)).toBe(
                    false,
                );
                expect(remainingDocs.includes(mockFrenchContentDto)).toBe(false);
            });
        });

        it("triggers sync when a language is added to the passed appLanguageIdsAsRef array config property", async () => {
            syncActive.value = false;

            waitForExpect(() => expect(syncActive.value).toBe(false));

            config.appLanguageIdsAsRef?.value.push("lang-fra");

            waitForExpect(() => expect(syncActive.value).toBe(true));
        });
    });

    describe("syncMap", () => {
        it("can re-calculate syncMap when accessMap is updated", async () => {
            await db.luminaryInternals.clear(); // Clear database to give predictable results
            await db.getSyncMap();

            accessMap.value = {
                "group-re-calc-sync-map": {
                    post: { view: true, edit: true, delete: true, translate: true, publish: true },
                },
            };

            await waitForExpect(async () => {
                await db.getSyncMap();

                const _sm = Object.fromEntries(syncMap.value);
                const post = Object.values(_sm).find((e: any) =>
                    isEqual(e.groups, ["group-re-calc-sync-map"]),
                );

                expect(post).toBeDefined();
                expect(post?.blocks[0].blockStart).toBe(0);
                expect(post?.blocks[0].blockEnd).toBe(0);
            });
        });

        it("can remove a group entry from the syncMap when the user's access has changed", async () => {
            await sync.calcSyncMap();

            accessMap.value["group-public-users"] = {
                post: { view: true, edit: true, delete: true, translate: true, publish: true },
            };

            await sync.calcSyncMap();

            const _sm1 = Object.fromEntries(syncMap.value);
            const _post1 = Object.values(_sm1).find((e: any) =>
                isEqual(e.groups, ["group-public-users"]),
            );
            // added group
            expect(_post1).toBeDefined();

            delete accessMap.value["group-public-users"];

            await sync.calcSyncMap();

            const _sm2 = Object.fromEntries(syncMap.value);
            const _post2 = Object.values(_sm2).find((e: any) =>
                e.groups.includes("group-public-users"),
            );
            // removed group
            expect(_post2).toBe(undefined);
        });

        it("can remove a type entry from the syncMap when the app's syncList has changed", async () => {
            await sync.calcSyncMap();
            config.syncList = [
                {
                    type: DocType.Post,
                    contentOnly: true,
                    syncPriority: 10,
                    skipWaitForLanguageSync: true,
                    sync: true,
                },
                {
                    type: DocType.Post,
                    contentOnly: false,
                    syncPriority: 10,
                    skipWaitForLanguageSync: true,
                    sync: true,
                },
                {
                    type: DocType.Group,
                    contentOnly: false,
                    syncPriority: 10,
                    skipWaitForLanguageSync: true,
                    sync: true,
                },
                {
                    type: DocType.Tag,
                    contentOnly: true,
                    syncPriority: 9,
                    skipWaitForLanguageSync: true,
                    sync: true,
                },
                {
                    type: DocType.Language,
                    contentOnly: false,
                    syncPriority: 9,
                    skipWaitForLanguageSync: true,
                    sync: true,
                },
                {
                    type: DocType.Tag,
                    contentOnly: false,
                    syncPriority: 10,
                    skipWaitForLanguageSync: true,
                    sync: true,
                },
            ];
            await sync.calcSyncMap();

            const _sm1 = Object.fromEntries(syncMap.value);
            const _post10 = Object.values(_sm1).find(
                (e: any) => isEqual(e.types, [DocType.Tag]) && e.syncPriority == 10,
            );
            const _post9 = Object.values(_sm1).find(
                (e: any) => isEqual(e.types, [DocType.Tag]) && e.syncPriority == 9,
            );
            const _otherPost = Object.values(_sm1).find(
                (e: any) =>
                    e.types.includes(DocType.Tag) && !(e.id == _post10?.id || e.id == _post9?.id),
            );
            // added type
            expect(_post10).toBeDefined();
            expect(_post9).toBeDefined();
            expect(_otherPost).toBe(undefined);

            config.syncList = [
                { type: DocType.Post, contentOnly: true, syncPriority: 10, sync: true },
                { type: DocType.Post, contentOnly: false, syncPriority: 10, sync: true },
                { type: DocType.Group, contentOnly: false, syncPriority: 10, sync: true },
                {
                    type: DocType.Language,
                    contentOnly: false,
                    syncPriority: 9,
                    skipWaitForLanguageSync: true,
                    sync: true,
                },
            ];

            await sync.calcSyncMap();

            const _sm2 = Object.fromEntries(syncMap.value);
            const _post2 = Object.values(_sm2).find((e: any) => e.types.includes(DocType.Tag));
            // removed type
            expect(_post2).toBe(undefined);
        });

        it("can remove a languages entry from the syncMap when the app's languages has changed", async () => {
            await sync.calcSyncMap();
            config.appLanguageIdsAsRef!.value.push("lang-ger");
            await sync.calcSyncMap();

            const _sm1 = Object.fromEntries(syncMap.value);
            const _post10 = Object.values(_sm1).find(
                (e: any) =>
                    isEqual(e.languages, ["lang-ger"]) && e.syncPriority == 10 && !e.contentOnly,
            );
            const _post10_content = Object.values(_sm1).find(
                (e: any) =>
                    isEqual(e.languages, ["lang-ger"]) && e.syncPriority == 10 && e.contentOnly,
            );
            const _post9 = Object.values(_sm1).find(
                (e: any) =>
                    isEqual(e.languages, ["lang-ger"]) && e.syncPriority == 9 && !e.contentOnly,
            );
            const _otherPost = Object.values(_sm1).find(
                (e: any) =>
                    e.languages.includes("lang-ger") &&
                    !(e.id == _post10?.id || e.id == _post9?.id || e.id == _post10_content?.id),
            );
            // added type
            expect(_post10).toBeDefined();
            expect(_post9).toBe(undefined);
            expect(_otherPost).toBe(undefined);

            config.appLanguageIdsAsRef!.value.pop();

            await sync.calcSyncMap();

            const _sm2 = Object.fromEntries(syncMap.value);
            const _post2 = Object.values(_sm2).find((e: any) => e.languages.includes("lang-ger"));
            // removed type
            expect(_post2).toBe(undefined);
        });

        it("can insert a block into the syncMap", async () => {
            let post;
            let posts;
            let blocks;
            syncMap.value.set("post_group-super-admins", {
                id: "post_group-super-admins",
                types: [DocType.Post],
                contentOnly: false,
                groups: ["group-super-admins"],
                languages: [],
                syncPriority: 1,
                blocks: [
                    {
                        blockStart: 700,
                        blockEnd: 500,
                    },
                    {
                        blockStart: 4200,
                        blockEnd: 4000,
                    },
                    {
                        blockStart: 0,
                        blockEnd: 0,
                    },
                ],
            });

            // test expand to end
            await sync.insertBlock({
                id: "post_group-super-admins",
                groups: ["group-super-admins"],
                blockStart: 500,
                blockEnd: 400,
                accessMap: accessMap,
                types: [DocType.Post],
            });

            posts = syncMap.value.get("post_group-super-admins") || { blocks: [] };
            blocks = posts.blocks;
            post = blocks.reduce((prev, curr) => (curr.blockEnd == 400 ? curr : prev), {});
            expect(post.blockEnd).toBe(400);

            // test expand to start
            await sync.insertBlock({
                id: "post_group-super-admins",
                groups: ["group-super-admins"],
                blockStart: 800,
                blockEnd: 700,
                accessMap: accessMap,
                types: [DocType.Post],
            });

            posts = syncMap.value.get("post_group-super-admins") || { blocks: [] };
            blocks = posts.blocks;
            post = blocks.reduce((prev, curr) => (curr.blockStart == 800 ? curr : prev), {});
            expect(post.blockStart).toBe(800);

            // test expand overlap
            await sync.insertBlock({
                id: "post_group-super-admins",
                groups: ["group-super-admins"],
                blockStart: 800,
                blockEnd: 400,
                accessMap: accessMap,
                types: [DocType.Post],
            });

            posts = syncMap.value.get("post_group-super-admins") || { blocks: [] };
            blocks = posts.blocks;
            post = blocks.reduce(
                (prev, curr) => (curr.blockStart == 800 && curr.blockEnd == 400 ? curr : prev),
                {},
            );
            expect(post.blockStart).toBe(800);

            // test contains
            await sync.insertBlock({
                id: "post_group-super-admins",
                groups: ["group-super-admins"],
                blockStart: 4100,
                blockEnd: 4010,
                accessMap: accessMap,
                types: [DocType.Post],
            });

            posts = syncMap.value.get("post_group-super-admins") || { blocks: [] };
            blocks = posts.blocks;
            post = blocks.reduce(
                (prev, curr) => (curr.blockStart == 4200 && curr.blockEnd == 4000 ? curr : prev),
                {},
            );
            expect(post.blockStart).toBe(4200);

            // test insert block
            await sync.insertBlock({
                id: "post_group-super-admins",
                groups: ["group-super-admins"],
                blockStart: 200,
                blockEnd: 100,
                accessMap: accessMap,
                types: [DocType.Post],
            });

            posts = syncMap.value.get("post_group-super-admins") || { blocks: [] };
            blocks = posts.blocks;
            post = blocks.reduce(
                (prev, curr) => (curr.blockStart == 200 && curr.blockEnd == 100 ? curr : prev),
                {},
            );
            expect(post.blockStart).toBe(200);
        });

        it("can concatenate 2 blocks of data", async () => {
            syncMap.value.set("post_group-super-admins", syncMapEntry);

            // test contains
            await sync.insertBlock({
                id: "post_group-super-admins",
                groups: ["group-super-admins"],
                blockStart: 1100,
                blockEnd: 650,
                accessMap: accessMap,
                types: [DocType.Post],
            });

            const posts = syncMap.value.get("post_group-super-admins") || { blocks: [] };
            const blocks = posts.blocks;
            const post: any = blocks.reduce(
                (prev, curr) =>
                    curr && curr.blockStart == 2000 && curr.blockEnd == 500 ? curr : prev,
                {},
            );
            expect(post.blockStart).toBe(2000);
        });

        it("can calculate chunk of missing data correctly", async () => {
            syncMapEntry.blocks.push({ blockStart: 10000, blockEnd: 9000 });
            syncMap.value.set("post_group-super-admins", syncMapEntry);

            const missingData = sync.calcMissingData("post_group-super-admins");

            expect(missingData.gapStart).toBe(9000);
            expect(missingData.gapEnd).toBe(2000);
        });

        it("can remove block 0 0 if the api back fill is complete", async () => {
            syncMap.value.set("post_group-super-admins", syncMapEntry);

            sync.removeBlock00("post_group-super-admins");
            const posts = syncMap.value.get("post_group-super-admins") || { blocks: [] };
            const block = posts.blocks.find((b) => b.blockStart == 0 && b.blockEnd == 0);

            expect(block).toBe(undefined);
        });

        it("can merge 2 syncMap entries, if they have the same priority and the same contentOnly flag, and one of them us completed sync (group)", async () => {
            syncMap.value.clear();
            syncMap.value.set("2_syncMap_main", {
                ...syncMapEntry,
                syncPriority: 2,
                id: "2_syncMap_main",
            });
            syncMap.value.set("2_syncMap_sub", {
                ...syncMapEntry,
                id: "1_syncMap_sub",
                groups: ["group-sync-map-merge-test"],
                blocks: [{ blockStart: 1000, blockEnd: 100 }],
                syncPriority: 2,
            });

            sync.mergeSyncMapEntries("2_syncMap_sub");

            const _post = syncMap.value.get("2_syncMap_main");

            expect(_post?.id).toBe("2_syncMap_main");
            expect(
                isEqual(_post?.groups, ["group-super-admins", "group-sync-map-merge-test"]),
            ).toBeTruthy();
        });

        it("can merge 2 syncMap entries, if they have the same priority and the same contentOnly flag, and one of them us completed sync (type)", async () => {
            syncMap.value.clear();
            syncMap.value.set("2_syncMap_main", {
                ...syncMapEntry,
                syncPriority: 2,
                id: "2_syncMap_main",
            });
            syncMap.value.set("2_syncMap_sub", {
                ...syncMapEntry,
                id: "1_syncMap_sub",
                types: [DocType.Tag],
                blocks: [{ blockStart: 1000, blockEnd: 100 }],
                syncPriority: 2,
            });

            sync.mergeSyncMapEntries("2_syncMap_sub");

            const _post = syncMap.value.get("2_syncMap_main");

            expect(_post?.id).toBe("2_syncMap_main");
            expect(isEqual(_post?.types, [DocType.Post, DocType.Tag])).toBeTruthy();
        });

        it("can merge 2 syncMap entries, if they have the same priority and the same contentOnly flag, and one of them us completed sync (languages)", async () => {
            syncMap.value.clear();
            syncMap.value.set("2_syncMap_main", {
                ...syncMapEntry,
                syncPriority: 2,
                id: "2_syncMap_main",
            });
            syncMap.value.set("2_syncMap_sub", {
                ...syncMapEntry,
                id: "1_syncMap_sub",
                languages: ["lang-ger"],
                blocks: [{ blockStart: 1000, blockEnd: 100 }],
                syncPriority: 2,
            });

            sync.mergeSyncMapEntries("2_syncMap_sub");

            const _post = syncMap.value.get("2_syncMap_main");

            expect(_post?.id).toBe("2_syncMap_main");
            expect(isEqual(_post?.languages, ["lang-eng", "lang-ger"])).toBeTruthy();
        });

        it("can remove old values from the syncMap that is not valid anymore", async () => {
            syncMap.value.clear();
            syncMap.value.set("2_syncMap_main", {
                ...syncMapEntry,
                syncPriority: 2,
                id: "2_syncMap_main",
            });

            await sync.calcSyncMap();

            const _post = syncMap.value.get("2_syncMap_main");

            expect(_post).toBe(undefined);
        });
    });
});
