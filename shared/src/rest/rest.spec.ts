import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi, afterAll, beforeAll } from "vitest";
import waitForExpect from "wait-for-expect";
import { mockEnglishContentDto, mockPostDto } from "../tests/mockdata";
import { Server } from "socket.io";
import { db, syncMap } from "../db/database";
import { AckStatus, ChangeReqDto, DocType } from "../types";
import { accessMap } from "../permissions/permissions";
import { initLuminaryShared } from "../luminary";
import { getRest } from "./rest";
let rest;

vi.mock("../config/config", () => ({
    config: {
        apiUrl: "http://localhost:12345",
        isCms: true,
        maxUploadFileSize: 1234,
        setMaxUploadFileSize: vi.fn(),
    },
}));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("rest", () => {
    beforeAll(async () => {
        await initLuminaryShared({ cms: true, docsIndex: "parentId, language, [type+docType]" });
        rest = getRest({
            cms: true,
            apiUrl: "http://localhost:3000",
            docTypes: [{ type: DocType.Post, contentOnly: true }],
            token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjhaU2lyMDBLcmI0Q3c0T2ljWXJ2TyJ9.eyJodHRwczovL2FwcC5iY2MuYWZyaWNhL21ldGFkYXRhIjp7ImNodXJjaE5hbWUiOiJTb3V0aCBBZnJpY2EiLCJlbWFpbCI6Im9zd2FsZEBzbGFiYmVydC5vcmciLCJoYXNNZW1iZXJzaGlwIjp0cnVlLCJwZXJzb25JZCI6NDY1MTN9LCJpc3MiOiJodHRwczovL2JjY3NhLnVzLmF1dGgwLmNvbS8iLCJzdWIiOiJvYXV0aDJ8YmNjLWxvZ2lufGY0MDFkMTMzLWNhYjktNGEwNS05NTgyLTIyYmVhZmZmMzZjNSIsImF1ZCI6WyJodHRwczovL2FwcC5iY2MuYWZyaWNhL2FwaSIsImh0dHBzOi8vYmNjc2EudXMuYXV0aDAuY29tL3VzZXJpbmZvIl0sImlhdCI6MTczMjc5NzU0MiwiZXhwIjoxNzMyODgzOTQyLCJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIG9mZmxpbmVfYWNjZXNzIiwiYXpwIjoiWVV2NXVIRXo0ZVE0bk9rYWhuUkxZN0htWGNmbmxGTkQiLCJwZXJtaXNzaW9ucyI6WyJncm91cF9zdXBlcmFkbWluIl19.ejqGFZmwwkFbl1iJvKtuwW3-DB42OUMPREFJoyUfdo4QmLZC8aFESc-q97Mlzq--lXB6pdmUCtrmdgnErwZotrrLG1QEzH8EP34G2tkfuo_q2ZLGnRUYsxj8RFnnnj21pn9GmP_RyxTzagGE_kS734se_47zDRpS7o9hJd4KZQCYMvmTQT1bMnnxkg5c5wut_BY4lY69sf1gNATxZJRt9cEnBSdJzq0_zK9PzxM2B6dkPYTn77PzNWKT8zi09IojtpLTpcvYN2X98xoar7ci9a4eAWX1d4L0KB7cs39rVXEiimU3zkoxse5gNsE9SSA5CUyNjmjitelUnwfl1RLqJA",
        });
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

    it.skip("can insert a block into the syncMap", async () => {
        let post;
        let posts;
        let blocks;
        syncMap.value.set("post", {
            type: DocType.Post,
            contentOnly: false,
            blocks: [
                {
                    blockStart: 700,
                    blockEnd: 500,
                    accessMap: accessMap.value,
                    groups: [],
                    type: DocType.Post,
                    contentOnly: false,
                },
                {
                    blockStart: 4200,
                    blockEnd: 4000,
                    accessMap: accessMap.value,
                    groups: [],
                    type: DocType.Post,
                    contentOnly: false,
                },
            ],
        });

        // test expand to end
        await rest.calcSyncMap({
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
        await rest.calcSyncMap({
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
        await rest.calcSyncMap({
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
        await rest.calcSyncMap({
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
        await rest.calcSyncMap({
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

    it.skip("can concatenate 2 blocks of data", async () => {
        syncMap.value.set("post", {
            type: DocType.Post,
            contentOnly: false,
            blocks: [
                {
                    blockStart: 700,
                    blockEnd: 500,
                    accessMap: accessMap.value,
                    groups: [],
                    type: DocType.Post,
                    contentOnly: false,
                },
                {
                    blockStart: 2000,
                    blockEnd: 1000,
                    accessMap: accessMap.value,
                    groups: [],
                    type: DocType.Post,
                    contentOnly: false,
                },
            ],
        });

        // test contains
        await rest.calcSyncMap({
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

    it.skip("can calculate chunk of missing data correctly", async () => {
        syncMap.value.set("post", {
            type: DocType.Post,
            contentOnly: false,
            blocks: [
                {
                    blockStart: 700,
                    blockEnd: 500,
                    accessMap: accessMap.value,
                    groups: [],
                    type: DocType.Post,
                    contentOnly: false,
                },
                {
                    blockStart: 2000,
                    blockEnd: 1000,
                    accessMap: accessMap.value,
                    groups: [],
                    type: DocType.Post,
                    contentOnly: false,
                },
            ],
        });

        const missingData = rest.calcMissingData(DocType.Post);

        expect(missingData.gapStart).toBe(1000);
        expect(missingData.gapEnd).toBe(700);
    });

    it(
        "temp test query api",
        async () => {
            console.log(syncMap.value);
            await rest.clientDataReq();
        },
        { timeout: 3000000 },
    );
});
