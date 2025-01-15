import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi, afterAll, beforeAll } from "vitest";
import { db, syncMap } from "../db/database";
import { DocType } from "../types";
import { accessMap } from "../permissions/permissions";
import { initLuminaryShared } from "../luminary";
import { getRest } from "../rest/RestApi";
let rest;

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
        syncMap.value.set("pos_group-private-userst", {
            id: "post_group-private-users",
            type: DocType.Post,
            contentOnly: false,
            accessMap: accessMap.value,
            group: "group-private-users",
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

        accessMap.value["group-public-users"] = {
            post: { view: true, edit: true, delete: true, translate: true, publish: true },
        };

        await rest.docs.calcSyncMap();

        const _post = syncMap.value.get("post_group-public-users");
        expect(_post?.blocks[0].blockStart).toBe(0);
        expect(_post?.blocks[0].blockEnd).toBe(0);
    });

    it("can insert a block into the syncMap", async () => {
        let post;
        let posts;
        let blocks;
        syncMap.value.set("post_group-private-users", {
            id: "post_group-private-users",
            type: DocType.Post,
            contentOnly: false,
            accessMap: accessMap.value,
            group: "group-private-users",
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
            id: "post_group-private-users",
            group: "group-private-users",
            blockStart: 500,
            blockEnd: 400,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post_group-private-users") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce((prev, curr) => (curr.blockEnd == 400 ? curr : prev), {});
        expect(post.blockEnd).toBe(400);

        // test expand to start
        await rest.docs.calcSyncMap({
            id: "post_group-private-users",
            group: "group-private-users",
            blockStart: 800,
            blockEnd: 700,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post_group-private-users") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce((prev, curr) => (curr.blockStart == 800 ? curr : prev), {});
        expect(post.blockStart).toBe(800);

        // test expand overlap
        await rest.docs.calcSyncMap({
            id: "post_group-private-users",
            group: "group-private-users",
            blockStart: 800,
            blockEnd: 400,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post_group-private-users") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce(
            (prev, curr) => (curr.blockStart == 800 && curr.blockEnd == 400 ? curr : prev),
            {},
        );
        expect(post.blockStart).toBe(800);

        // test contains
        await rest.docs.calcSyncMap({
            id: "post_group-private-users",
            group: "group-private-users",
            blockStart: 4100,
            blockEnd: 4010,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post_group-private-users") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce(
            (prev, curr) => (curr.blockStart == 4200 && curr.blockEnd == 4000 ? curr : prev),
            {},
        );
        expect(post.blockStart).toBe(4200);

        // test insert block
        await rest.docs.calcSyncMap({
            id: "post_group-private-users",
            group: "group-private-users",
            blockStart: 200,
            blockEnd: 100,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post_group-private-users") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce(
            (prev, curr) => (curr.blockStart == 200 && curr.blockEnd == 100 ? curr : prev),
            {},
        );
        expect(post.blockStart).toBe(200);
    });

    it("can concatenate 2 blocks of data", async () => {
        syncMap.value.set("post_group-private-users", {
            id: "post_group-private-users",
            type: DocType.Post,
            contentOnly: false,
            accessMap: accessMap.value,
            group: "group-private-users",
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
        });

        // test contains
        await rest.docs.calcSyncMap({
            id: "post_group-private-users",
            group: "group-private-users",
            blockStart: 1100,
            blockEnd: 650,
            accessMap: accessMap,
            type: DocType.Post,
        });

        const posts = syncMap.value.get("post_group-private-users") || { blocks: [] };
        const blocks = posts.blocks;
        const post: any = blocks.reduce(
            (prev, curr) => (curr && curr.blockStart == 2000 && curr.blockEnd == 500 ? curr : prev),
            {},
        );
        expect(post.blockStart).toBe(2000);
    });

    it("can calculate chunk of missing data correctly", async () => {
        syncMap.value.set("post_group-private-users", {
            id: "post_group-private-users",
            type: DocType.Post,
            contentOnly: false,
            accessMap: accessMap.value,
            group: "group-private-users",
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
        });

        const missingData = rest.docs.calcMissingData("post_group-private-users");

        expect(missingData.gapStart).toBe(1000);
        expect(missingData.gapEnd).toBe(700);
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
        syncMap.value.set("post_group-private-users", {
            id: "post_group-private-users",
            type: DocType.Post,
            contentOnly: false,
            accessMap: accessMap.value,
            group: "group-private-users",
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
        });

        rest.docs.removeBlock00("post_group-private-users");
        const posts = syncMap.value.get("post_group-private-users") || { blocks: [] };
        const block = posts.blocks.find((b) => b.blockStart == 0 && b.blockEnd == 0);

        expect(block).toBe(undefined);
    });
});
