import "fake-indexeddb/auto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { initConfig } from "../../config";
import { db, initDatabase } from "../../db/database";
import { DeleteReason, DocType, type BaseDocumentDto } from "../../types";
import { mangoCompile } from "../../util/MangoQuery/mangoCompile";
import { accessMap } from "../../permissions/permissions";
import { initSync, setCancelSync, sync } from "./sync";
import { syncList, tuplePaginationSupported } from "./state";

const post = (id: string, group = "g1", time = 10000): BaseDocumentDto => ({
    _id: id,
    type: DocType.Post,
    memberOf: [group],
    updatedTimeUtc: time,
});
let remote: BaseDocumentDto[];
const http = {
    post: vi.fn(async (_path: string, query: any) => {
        const after = query.syncPagination?.after;
        const selector = after
            ? {
                  ...query.selector,
                  $and: [
                      ...(query.selector.$and ?? []),
                      {
                          $or: [
                              { updatedTimeUtc: { $lt: after.updatedTimeUtc } },
                              { updatedTimeUtc: after.updatedTimeUtc, _id: { $lt: after.id } },
                          ],
                      },
                  ],
              }
            : query.selector;
        return {
            docs: remote
                .filter(mangoCompile(selector))
                .sort(
                    (a, b) =>
                        b.updatedTimeUtc - a.updatedTimeUtc ||
                        (a._id < b._id ? 1 : a._id === b._id ? 0 : -1),
                )
                .slice(0, query.limit),
        };
    }),
};

describe("negotiated stable sync runner", () => {
    beforeAll(async () => {
        initConfig({
            cms: true,
            docsIndex: "",
            apiUrl: "http://localhost",
            appLanguageIdsAsRef: ref([]),
        });
        await initDatabase();
        await initSync(http as any);
    });
    beforeEach(async () => {
        setCancelSync(false);
        tuplePaginationSupported.value = false;
        await db.clear();
        syncList.value = [];
        await db.selectSyncProtocol(false, syncList);
        tuplePaginationSupported.value = true;
        remote = [post("tie-a"), post("tie-b"), post("tie-c")];
        http.post.mockClear();
    });
    afterEach(async () => {
        setCancelSync(true);
        tuplePaginationSupported.value = false;
        syncList.value = [];
        await db.clear();
        setCancelSync(false);
    });

    it("negotiates the default store and applies later DeleteCmd pages", async () => {
        await sync({ type: DocType.Post, memberOf: ["g1"], limit: 2 });
        expect(await db.docs.count()).toBe(3);
        expect(http.post.mock.calls.every(([, body]) => body.syncPagination.version === 1)).toBe(
            true,
        );
        remote = [
            post("tie-b"),
            post("tie-c"),
            post("new-post", "g1", 20000),
            {
                _id: "remove-a",
                type: DocType.DeleteCmd,
                docType: DocType.Post,
                docId: "tie-a",
                deleteReason: DeleteReason.Deleted,
                memberOf: ["g1"],
                updatedTimeUtc: 15000,
            } as BaseDocumentDto,
        ];
        await sync({ type: DocType.Post, memberOf: ["g1"], limit: 2 });
        expect(await db.docs.get("tie-a")).toBeUndefined();
        expect(await db.docs.get("new-post")).toBeDefined();
        expect(syncList.value.every((entry) => entry.eof && !entry.pendingPage)).toBe(true);
    });

    it("downloads tied documents after memberOf growth and merges completed columns", async () => {
        remote.push(post("other-a", "g2"), post("other-b", "g2"), post("other-c", "g2"));
        await sync({ type: DocType.Post, memberOf: ["g1"], limit: 2, includeDeleteCmds: false });
        expect(await db.docs.count()).toBe(3);
        await sync({
            type: DocType.Post,
            memberOf: ["g1", "g2"],
            limit: 2,
            includeDeleteCmds: false,
        });
        expect(await db.docs.count()).toBe(6);
        expect(syncList.value).toHaveLength(1);
        expect([...syncList.value[0].memberOf].sort()).toEqual(["g1", "g2"]);
        expect(syncList.value[0].eof).toBe(true);
    });

    it("preserves language fallback and publish-date constraints across tied content pages", async () => {
        remote = [
            {
                _id: "english",
                type: DocType.Content,
                parentId: "p-en",
                parentType: DocType.Post,
                language: "en",
                memberOf: ["g1"],
                updatedTimeUtc: 10000,
                publishDate: 100,
            },
            {
                _id: "fallback",
                type: DocType.Content,
                parentId: "p-fr",
                parentType: DocType.Post,
                language: "fr",
                memberOf: ["g1"],
                updatedTimeUtc: 10000,
                publishDate: 200,
            },
            {
                _id: "excluded-date",
                type: DocType.Content,
                parentId: "p-old",
                parentType: DocType.Post,
                language: "fr",
                memberOf: ["g1"],
                updatedTimeUtc: 10000,
                publishDate: 400,
            },
        ] as BaseDocumentDto[];
        await sync({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["g1"],
            languages: ["en"],
            publishDateMin: 0,
            publishDateMax: 300,
            limit: 1,
            includeDeleteCmds: false,
            cms: false,
        });
        expect((await db.docs.toArray()).map((doc) => doc._id).sort()).toEqual([
            "english",
            "fallback",
        ]);
        expect(
            http.post.mock.calls.every(
                ([, body]) => body.selector.$or && body.selector.publishDate.$lte === 300,
            ),
        ).toBe(true);
    });

    it("repairs a stalled legacy column after the server gains the capability", async () => {
        tuplePaginationSupported.value = false;
        await expect(
            sync({ type: DocType.Post, memberOf: ["g1"], limit: 2, includeDeleteCmds: false }),
        ).rejects.toThrow("updated API is required");
        expect(await db.docs.count()).toBe(2);
        expect(syncList.value[0].eof).toBe(false);
        tuplePaginationSupported.value = true;
        await sync({ type: DocType.Post, memberOf: ["g1"], limit: 2, includeDeleteCmds: false });
        expect(await db.docs.count()).toBe(3);
        expect(syncList.value[0].eof).toBe(true);
        expect(await db.getLuminaryInternals("syncList:timestamp-id-v1")).toEqual(syncList.value);
    });
    it("discards a page when authorization changes while its HTTP request is in flight", async () => {
        const answer = http.post.getMockImplementation()!;
        http.post.mockImplementationOnce(async (path, query) => {
            accessMap.value = {};
            return answer(path, query);
        });
        await sync({ type: DocType.Post, memberOf: ["g1"], limit: 2 });
        expect(await db.docs.count()).toBe(0);
        expect(syncList.value.every((entry) => !entry.eof)).toBe(true);
        expect(syncList.value.some((entry) => entry.chunkType.startsWith("deleteCmd"))).toBe(false);
    });
});
