import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi, afterAll, beforeAll } from "vitest";
import { db, SyncMap, syncMap } from "../db/database";
import { DocType } from "../types";
import { accessMap } from "../permissions/permissions";
import { initLuminaryShared } from "../luminary";
import { getRest } from "./RestApi";
import express from "express";
import { ApiSearchQuery } from "./RestApi";
import waitForExpect from "wait-for-expect";
import _ from "lodash";

const app = express();
const port = 12349;
let rest;
let mockApiRequest;
let apiRecursiveTest = { types: [""], groups: [""], contentOnly: false }; // update parameters to run a recursive test on a specific doctype group
let mockApiCheckFor = (res: any) => {
    return res;
};
let mockApiCheckForRes;

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
            _.isEqual(a.types, b.types) &&
                _.isEqual(a.groups, b.groups) &&
                a.contentOnly == b.contentOnly
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
        await initLuminaryShared({ cms: true, docsIndex: "parentId, language, [type+docType]" });
        rest = getRest({
            apiUrl: "http://127.0.0.1:" + port,
            docTypes: [
                { type: DocType.Post, contentOnly: true, syncPriority: 10 },
                { type: DocType.Post, contentOnly: false, syncPriority: 10 },
                { type: DocType.Group, contentOnly: false, syncPriority: 10 },
            ],
        });

        accessMap.value["group-super-admins"] = {
            post: { view: true, edit: true, delete: true, translate: true, publish: true },
        };

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
    });

    afterAll(async () => {
        vi.restoreAllMocks();

        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("can add a new entry into the syncMap when the user's access has changed", async () => {
        // syncMap.value.set("pos_group-super-admins", syncMapEntry);

        accessMap.value["group-public-users"] = {
            post: { view: true, edit: true, delete: true, translate: true, publish: true },
        };

        // await rest._sync.calcSyncMap();

        waitForExpect(() => {
            const _sm = Object.fromEntries(syncMap.value);
            const _post = Object.values(_sm).find((e: any) =>
                e.groups.find((g) => g == "group-public-users"),
            );
            expect(_post?.blocks[0].blockStart).toBe(0);
            expect(_post?.blocks[0].blockEnd).toBe(0);
        });
    });

    it("can remove a entry from the syncMap when the user's access has changed", async () => {
        syncMap.value.set("pos_group-super-admins", syncMapEntry);

        accessMap.value["group-public-users"] = {
            post: { view: true, edit: true, delete: true, translate: true, publish: true },
        };

        await rest._sync.calcSyncMap();

        delete accessMap.value["group-public-users"];

        await rest._sync.calcSyncMap();

        const _post = syncMap.value.get("post_group-public-users");
        expect(_post).toBe(undefined);
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
        await rest._sync.insertBlock({
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
        await rest._sync.insertBlock({
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
        await rest._sync.insertBlock({
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
        await rest._sync.insertBlock({
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
        await rest._sync.insertBlock({
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
        await rest._sync.insertBlock({
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
            (prev, curr) => (curr && curr.blockStart == 2000 && curr.blockEnd == 500 ? curr : prev),
            {},
        );
        expect(post.blockStart).toBe(2000);
    });

    it("can calculate chunk of missing data correctly", async () => {
        syncMapEntry.blocks.push({ blockStart: 10000, blockEnd: 9000 });
        syncMap.value.set("post_group-super-admins", syncMapEntry);

        const missingData = rest._sync.calcMissingData("post_group-super-admins");

        expect(missingData.gapStart).toBe(9000);
        expect(missingData.gapEnd).toBe(2000);
    });

    it("can remove block 0 0 if the api back fill is complete", async () => {
        syncMap.value.set("post_group-super-admins", syncMapEntry);

        rest._sync.removeBlock00("post_group-super-admins");
        const posts = syncMap.value.get("post_group-super-admins") || { blocks: [] };
        const block = posts.blocks.find((b) => b.blockStart == 0 && b.blockEnd == 0);

        expect(block).toBe(undefined);
    });

    it("can correctly sort the queue", async () => {
        const queue = [
            { id: "a", syncPriority: 3, query: { from: 23 } },
            { id: "b", syncPriority: 2, query: { from: 0 } },
            { id: "c", syncPriority: 1, query: { from: 0 } },
            { id: "d", syncPriority: 3, query: { from: 0 } },
            { id: "e", syncPriority: 2, query: { from: 10 } },
            { id: "f", syncPriority: 1, query: { from: 30 } },
        ];

        const q = rest._sync.sortQueue(queue);

        expect(q[0]?.id).toBe("f");
        expect(q[5]?.id).toBe("d");
    });

    it("can correctly query the api", async () => {
        const query: ApiSearchQuery = {
            apiVersion: "0.0.0",
            from: 0,
            types: [DocType.Post],
            groups: ["group-public-content"],
        };
        await rest._sync.req(query);

        await waitForExpect(() => {
            expect(mockApiRequest).toBe(JSON.stringify(query));
        });
    });

    it("can process clientDataReq", async () => {
        mockApiCheckFor = (res) => {
            if (_.isEqual(res.types, ["post"]) && _.isEqual(res.groups, ["group-super-admins"]))
                mockApiCheckForRes = res;
        };

        await rest._sync.clientDataReq();

        await waitForExpect(() => {
            const req = mockApiCheckForRes;
            expect(_.isEqual(req.types, ["post"])).toBeTruthy();
            expect(_.isEqual(req.groups, ["group-super-admins"])).toBeTruthy();
        });
    });

    // This test test the recursion of the clientDataReq, but acutely test much deeper, It also test mergeBlocks, insertBlocks, processQueue, calcMissingData,
    it(
        "can query the api recursively",
        async () => {
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
            await rest._sync.clientDataReq();

            await waitForExpect(() => {
                const post = syncMap.value.get("post_group-recursive-test");
                expect(post?.blocks[0].blockStart).toBe(20000);
                expect(post?.blocks[0].blockEnd).toBe(1000);
            }, 9000);
        },
        { timeout: 10000 },
    );

    it("can merge 2 syncMap entries, if they have the same priority and the same contentOnly flag", async () => {
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

        rest._sync.mergeSyncMapEntries("2_syncMap_sub");

        const _post = syncMap.value.get("2_syncMap_main");

        expect(_post?.id).toBe("2_syncMap_main");
        expect(
            _.isEqual(_post?.groups, ["group-super-admins", "group-sync-map-merge-test"]),
        ).toBeTruthy();
    });

    it("can remove old values from the syncMap that is not valid anymore", async () => {
        syncMap.value.clear();
        syncMap.value.set("2_syncMap_main", {
            ...syncMapEntry,
            syncPriority: 2,
            id: "2_syncMap_main",
        });

        await rest._sync.calcSyncMap();

        const _post = syncMap.value.get("2_syncMap_main");

        expect(_post).toBe(undefined);
    });

    // Test not working, syncMap does not update on test side, only in the syncFile
    it.skip(
        "re-calculates syncMap when accessMap is updated",
        async () => {
            accessMap.value["group-re-calc-sync-map"] = {
                post: { view: true, edit: true, delete: true, translate: true, publish: true },
            };

            await waitForExpect(() => {
                const post = syncMap.value.get("group-re-calc-sync-map");
                expect(post).toBeDefined();
                expect(post?.blocks[0].blockStart).toBe(0);
                expect(post?.blocks[0].blockEnd).toBe(0);
            }, 9000);
        },
        { timeout: 10000 },
    );
});
