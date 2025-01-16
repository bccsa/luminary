import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi, afterAll, beforeAll } from "vitest";
import { db, SyncMap, syncMap } from "../db/database";
import { DocType } from "../types";
import { accessMap } from "../permissions/permissions";
import { initLuminaryShared } from "../luminary";
import { getRest } from "../rest/RestApi";
let rest;

const syncMapEntry: SyncMap = {
    id: "post_group-super-admins",
    type: DocType.Post,
    contentOnly: false,
    group: "group-super-admins",
    syncPriority: 1,
    blocks: [],
};

vi.mock("../config/config", () => ({
    config: {
        apiUrl: "http://localhost:12345",
        isCms: true,
        maxUploadFileSize: 1234,
        setMaxUploadFileSize: vi.fn(),
    },
}));

describe("rest", () => {
    beforeAll(async () => {
        await initLuminaryShared({ cms: true, docsIndex: "parentId, language, [type+docType]" });
        rest = getRest({
            apiUrl: "http://localhost:3000",
            docTypes: [
                { type: DocType.Post, contentOnly: true },
                { type: DocType.Post, contentOnly: false },
                { type: DocType.Group, contentOnly: false },
            ],
        });

        accessMap.value["group-super-admins"] = {
            post: { view: true, edit: true, delete: true, translate: true, publish: true },
        };

        syncMapEntry.blocks = [
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
        ];
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
        syncMap.value.set("pos_group-super-admins", syncMapEntry);

        accessMap.value["group-public-users"] = {
            post: { view: true, edit: true, delete: true, translate: true, publish: true },
        };

        await rest.docs.calcSyncMap();

        const _post = syncMap.value.get("post_group-public-users");
        expect(_post?.blocks[0].blockStart).toBe(0);
        expect(_post?.blocks[0].blockEnd).toBe(0);
    });

    it("can remove a entry from the syncMap when the user's access has changed", async () => {
        syncMap.value.set("pos_group-super-admins", syncMapEntry);

        accessMap.value["group-public-users"] = {
            post: { view: true, edit: true, delete: true, translate: true, publish: true },
        };

        await rest.docs.calcSyncMap();

        delete accessMap.value["group-public-users"];

        await rest.docs.calcSyncMap();

        const _post = syncMap.value.get("post_group-public-users");
        expect(_post).toBe(undefined);
    });

    it("can insert a block into the syncMap", async () => {
        let post;
        let posts;
        let blocks;
        syncMap.value.set("post_group-super-admins", {
            id: "post_group-super-admins",
            type: DocType.Post,
            contentOnly: false,
            group: "group-super-admins",
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
        await rest.docs.calcSyncMap({
            id: "post_group-super-admins",
            group: "group-super-admins",
            blockStart: 500,
            blockEnd: 400,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post_group-super-admins") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce((prev, curr) => (curr.blockEnd == 400 ? curr : prev), {});
        expect(post.blockEnd).toBe(400);

        // test expand to start
        await rest.docs.calcSyncMap({
            id: "post_group-super-admins",
            group: "group-super-admins",
            blockStart: 800,
            blockEnd: 700,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post_group-super-admins") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce((prev, curr) => (curr.blockStart == 800 ? curr : prev), {});
        expect(post.blockStart).toBe(800);

        // test expand overlap
        await rest.docs.calcSyncMap({
            id: "post_group-super-admins",
            group: "group-super-admins",
            blockStart: 800,
            blockEnd: 400,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post_group-super-admins") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce(
            (prev, curr) => (curr.blockStart == 800 && curr.blockEnd == 400 ? curr : prev),
            {},
        );
        expect(post.blockStart).toBe(800);

        // test contains
        await rest.docs.calcSyncMap({
            id: "post_group-super-admins",
            group: "group-super-admins",
            blockStart: 4100,
            blockEnd: 4010,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post_group-super-admins") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce(
            (prev, curr) => (curr.blockStart == 4200 && curr.blockEnd == 4000 ? curr : prev),
            {},
        );
        expect(post.blockStart).toBe(4200);

        // test insert block
        await rest.docs.calcSyncMap({
            id: "post_group-super-admins",
            group: "group-super-admins",
            blockStart: 200,
            blockEnd: 100,
            accessMap: accessMap,
            type: DocType.Post,
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
        await rest.docs.calcSyncMap({
            id: "post_group-super-admins",
            group: "group-super-admins",
            blockStart: 1100,
            blockEnd: 650,
            accessMap: accessMap,
            type: DocType.Post,
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

        const missingData = rest.docs.calcMissingData("post_group-super-admins");

        expect(missingData.gapStart).toBe(9000);
        expect(missingData.gapEnd).toBe(2000);
    });

    it("creates a syncMapEntry for DocType.Group without a group", async () => {
        const syncMapEntries = rest.docs.calcSyncEntryKeys();
        const block = syncMapEntries.reduce(
            (prev, curr) => (curr.id == DocType.Group ? curr : prev),
            {},
        );

        expect(block.id).toBe(DocType.Group);
    });

    it("can remove block 0 0 if the api back fill is complete", async () => {
        syncMap.value.set("post_group-super-admins", syncMapEntry);

        rest.docs.removeBlock00("post_group-super-admins");
        const posts = syncMap.value.get("post_group-super-admins") || { blocks: [] };
        const block = posts.blocks.find((b) => b.blockStart == 0 && b.blockEnd == 0);

        expect(block).toBe(undefined);
    });

    it("can correctly sort the queue", async () => {
        const queue = [
            { id: "a", syncPriority: 1, query: { gapEnd: 23 } },
            { id: "b", syncPriority: 2, query: { gapEnd: 0 } },
            { id: "c", syncPriority: 3, query: { gapEnd: 0 } },
            { id: "d", syncPriority: 1, query: { gapEnd: 0 } },
            { id: "e", syncPriority: 2, query: { gapEnd: 10 } },
            { id: "f", syncPriority: 3, query: { gapEnd: 30 } },
        ];

        const q = rest.docs.sortQueue(queue);

        expect(q[0]?.id).toBe("f");
        expect(q[5]?.id).toBe("d");
    });
});
