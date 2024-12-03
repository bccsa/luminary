import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi, afterAll, beforeAll } from "vitest";
import { db, syncMap } from "../db/database";
import { DocType } from "../types";
import { accessMap } from "../permissions/permissions";
import { initLuminaryShared } from "../luminary";
import { getRest } from "../rest/rest";
let rest;

vi.mock("../config/config", () => ({
    config: {
        apiUrl: "http://localhost:12345",
        isCms: true,
        maxUploadFileSize: 1234,
        setMaxUploadFileSize: vi.fn(),
    },
}));

// const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("rest", () => {
    beforeAll(async () => {
        await initLuminaryShared({ cms: true, docsIndex: "parentId, language, [type+docType]" });
        rest = getRest({
            cms: true,
            apiUrl: "http://localhost:3000",
            docTypes: [
                { type: DocType.Post, contentOnly: true },
                { type: DocType.Post, contentOnly: false },
            ],
        });

        accessMap.value["group-super-admins"] = {
            post: { view: true, edit: true, delete: true, translate: true, publish: true },
        };
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await db.luminaryInternals.clear();
        // syncMap.value.clear();
    });

    afterAll(async () => {
        vi.restoreAllMocks();

        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("can reset a data type (e.g. post) when the users access has changed", async () => {
        syncMap.value.set("post", {
            type: DocType.Post,
            contentOnly: false,
            accessMap: accessMap.value,
            groups: rest.docs.calcGroups(),
            blocks: [
                {
                    blockStart: 700,
                    blockEnd: 500,
                    type: DocType.Post,
                    contentOnly: false,
                },
                {
                    blockStart: 4200,
                    blockEnd: 4000,
                    type: DocType.Post,
                    contentOnly: false,
                },
            ],
        });

        accessMap.value["group-private-users"] = {
            post: { view: true, edit: true, delete: true, translate: true, publish: true },
        };

        await rest.docs.calcSyncMap();

        const _post = syncMap.value.get("post");
        expect(_post?.blocks[0].blockStart).toBe(0);
        expect(_post?.blocks[0].blockEnd).toBe(0);
    });

    it("can insert a block into the syncMap", async () => {
        let post;
        let posts;
        let blocks;
        syncMap.value.set("post", {
            type: DocType.Post,
            contentOnly: false,
            accessMap: accessMap.value,
            groups: rest.docs.calcGroups(),
            blocks: [
                {
                    blockStart: 700,
                    blockEnd: 500,
                    type: DocType.Post,
                    contentOnly: false,
                },
                {
                    blockStart: 4200,
                    blockEnd: 4000,
                    type: DocType.Post,
                    contentOnly: false,
                },
            ],
        });

        // test expand to end
        await rest.docs.calcSyncMap({
            blockStart: 500,
            blockEnd: 400,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce((prev, curr) => (curr.blockEnd == 400 ? curr : prev), {});
        expect(post.blockEnd).toBe(400);

        // test expand to start
        await rest.docs.calcSyncMap({
            blockStart: 800,
            blockEnd: 700,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce((prev, curr) => (curr.blockStart == 800 ? curr : prev), {});
        expect(post.blockStart).toBe(800);

        // test expand overlap
        await rest.docs.calcSyncMap({
            blockStart: 800,
            blockEnd: 400,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce(
            (prev, curr) => (curr.blockStart == 800 && curr.blockEnd == 400 ? curr : prev),
            {},
        );
        expect(post.blockStart).toBe(800);

        // test contains
        await rest.docs.calcSyncMap({
            blockStart: 4100,
            blockEnd: 4010,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce(
            (prev, curr) => (curr.blockStart == 4200 && curr.blockEnd == 4000 ? curr : prev),
            {},
        );
        expect(post.blockStart).toBe(4200);

        // test insert block
        await rest.docs.calcSyncMap({
            blockStart: 200,
            blockEnd: 100,
            accessMap: accessMap,
            type: DocType.Post,
        });

        posts = syncMap.value.get("post") || { blocks: [] };
        blocks = posts.blocks;
        post = blocks.reduce(
            (prev, curr) => (curr.blockStart == 200 && curr.blockEnd == 100 ? curr : prev),
            {},
        );
        expect(post.blockStart).toBe(200);
    });

    it("can concatenate 2 blocks of data", async () => {
        syncMap.value.set("post", {
            type: DocType.Post,
            contentOnly: false,
            accessMap: accessMap.value,
            groups: rest.docs.calcGroups(),
            blocks: [
                {
                    blockStart: 700,
                    blockEnd: 500,
                    type: DocType.Post,
                    contentOnly: false,
                },
                {
                    blockStart: 2000,
                    blockEnd: 1000,
                    type: DocType.Post,
                    contentOnly: false,
                },
            ],
        });

        // test contains
        await rest.docs.calcSyncMap({
            blockStart: 1100,
            blockEnd: 650,
            accessMap: accessMap,
            type: DocType.Post,
        });

        const posts = syncMap.value.get("post") || { blocks: [] };
        const blocks = posts.blocks;
        const post: any = blocks.reduce(
            (prev, curr) => (curr.blockStart == 2000 && curr.blockEnd == 500 ? curr : prev),
            {},
        );
        expect(post.blockStart).toBe(2000);
    });

    it("can calculate chunk of missing data correctly", async () => {
        syncMap.value.set("post", {
            type: DocType.Post,
            contentOnly: false,
            accessMap: accessMap.value,
            groups: rest.docs.calcGroups(),
            blocks: [
                {
                    blockStart: 700,
                    blockEnd: 500,
                    type: DocType.Post,
                    contentOnly: false,
                },
                {
                    blockStart: 2000,
                    blockEnd: 1000,
                    type: DocType.Post,
                    contentOnly: false,
                },
            ],
        });

        const missingData = rest.docs.calcMissingData(DocType.Post);

        expect(missingData.gapStart).toBe(1000);
        expect(missingData.gapEnd).toBe(700);
    });
});
