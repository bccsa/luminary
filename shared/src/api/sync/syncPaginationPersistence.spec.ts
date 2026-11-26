import "fake-indexeddb/auto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { initConfig } from "../../config";
import { openDatabase } from "../../db/database";
import { UserActivityType, type BaseDocumentDto } from "../../types";
import { mangoCompile } from "../../util/MangoQuery/mangoCompile";
import { syncBatch } from "./syncBatch";
import { setCancelSync } from "./sync";
import { tuplePaginationSupported } from "./state";
import type { SyncListEntry, SyncOptions, SyncSource } from "./types";

type Connection = Awaited<ReturnType<typeof openDatabase>>;
const connections: Connection[] = [];
let sequence = 0;
const key = "syncList:timestamp-id-v1";
const documents = (count = 3, timestamp = 1000): BaseDocumentDto[] =>
    Array.from({ length: count }, (_, i) => ({
        _id: `tie-${String.fromCharCode(97 + i)}`,
        type: UserActivityType.Viewed,
        parentId: `post-${i}`,
        updatedTimeUtc: timestamp,
    }));

async function fixture(name = `tuple-progress-${++sequence}`, docs = documents()) {
    const db = await openDatabase({
        name,
        requestPersistentStorage: false,
        quietAcks: true,
        includeUserActivityTable: false,
    });
    connections.push(db);
    const list = ref<SyncListEntry[]>([]);
    await db.selectSyncProtocol(true, list);
    const state = { cancelled: false };
    const source: SyncSource = {
        name: "user",
        queryPath: "user/query",
        syncList: list,
        isCancelled: () => state.cancelled,
        put: (rows) => db.applySyncPage(rows, () => state.cancelled),
        setSyncList: () =>
            db.transaction("rw", db.luminaryInternals, async () => {
                if (!state.cancelled) await db.setSyncList(list);
            }),
    };
    const http = {
        post: vi.fn(
            async (
                _path: string,
                query: any,
                _callbacks?: { onError?: (status: number, message?: string) => void },
            ): Promise<any> => {
                void _callbacks;
                const after = query.syncPagination?.after;
                const selector = after
                    ? {
                          ...query.selector,
                          $and: [
                              ...(query.selector.$and ?? []),
                              {
                                  $or: [
                                      { updatedTimeUtc: { $lt: after.updatedTimeUtc } },
                                      {
                                          updatedTimeUtc: after.updatedTimeUtc,
                                          _id: { $lt: after.id },
                                      },
                                  ],
                              },
                          ],
                      }
                    : query.selector;
                return {
                    docs: docs
                        .filter(mangoCompile(selector))
                        .sort(
                            (a, b) =>
                                b.updatedTimeUtc - a.updatedTimeUtc ||
                                (a._id < b._id ? 1 : a._id === b._id ? 0 : -1),
                        )
                        .slice(0, query.limit),
                };
            },
        ),
    };
    const options: SyncOptions = {
        type: UserActivityType.Viewed,
        memberOf: ["*"],
        initialSync: true,
        pagination: "timestamp-id-v1",
        limit: 2,
        source,
        httpService: http as any,
    };
    return { db, list, state, source, http, options, name };
}

describe("durable timestamp/id pagination", () => {
    beforeAll(() =>
        initConfig({
            cms: true,
            docsIndex: "",
            apiUrl: "http://localhost",
            appLanguageIdsAsRef: ref([]),
        }),
    );
    beforeEach(() => setCancelSync(false));
    afterEach(async () => {
        setCancelSync(false);
        tuplePaginationSupported.value = false;
        for (const db of connections) db.close();
        for (const db of connections.splice(0)) await db.delete();
    });

    it("resumes an interrupted full timestamp after closing and reopening the database", async () => {
        const first = await fixture();
        const answer = first.http.post.getMockImplementation()!;
        first.http.post.mockImplementation(async (path, query) => {
            if (first.http.post.mock.calls.length === 2) throw new Error("connection lost");
            return answer(path, query);
        });
        await expect(syncBatch(first.options)).rejects.toThrow("connection lost");
        const saved = await first.db.getLuminaryInternals(key);
        expect(saved[0].pendingPage.after).toEqual({ updatedTimeUtc: 1000, id: "tie-b" });
        expect(saved[0].eof).toBe(false);
        first.db.close();

        const next = await fixture(first.name);
        await syncBatch(next.options);
        expect(next.http.post.mock.calls[0][1].syncPagination.after.id).toBe("tie-b");
        expect((await next.db.docs.toArray()).map((doc) => doc._id).sort()).toEqual([
            "tie-a",
            "tie-b",
            "tie-c",
        ]);
        expect(next.list.value[0].eof).toBe(true);
        expect(next.list.value[0].pendingPage).toBeUndefined();
    });

    it("rewalks legacy EOF metadata while retaining docs, queued edits and the owner marker", async () => {
        const f = await fixture();
        await f.db.setLuminaryInternals("syncList", [
            { chunkType: "viewed", memberOf: ["*"], blockStart: 1000, blockEnd: 0, eof: true },
        ]);
        await f.db.setLuminaryInternals("userActivityOwner", "issuer|subject");
        await f.db.upsert({
            doc: { ...documents()[0], updatedTimeUtc: 2000 },
            overwriteLocalChanges: true,
        });
        await f.db.selectSyncProtocol(false, f.list);
        expect(f.list.value[0].eof).toBe(true);
        await f.db.selectSyncProtocol(true, f.list);
        expect(f.list.value).toEqual([]);
        await syncBatch(f.options);
        expect(await f.db.docs.count()).toBe(3);
        expect((await f.db.docs.get("tie-a"))?.updatedTimeUtc).toBe(2000);
        expect(await f.db.localChanges.count()).toBe(1);
        expect(await f.db.getLuminaryInternals("userActivityOwner")).toBe("issuer|subject");
        expect((await f.db.getLuminaryInternals("syncList"))[0].eof).toBe(true);
    });

    it.each([0, 2, 4])(
        "checks exhaustion after exact full pages (%s documents at timestamp zero)",
        async (count) => {
            const f = await fixture(undefined, documents(count, 0));
            await syncBatch(f.options);
            expect(await f.db.docs.count()).toBe(count);
            expect(f.http.post).toHaveBeenCalledTimes(count / 2 + 1);
            expect(f.list.value[0].eof).toBe(true);
        },
    );

    it("does not advance a checkpoint when cancellation happens after the page write", async () => {
        const f = await fixture();
        const put = f.source.put;
        f.source.put = async (docs) => {
            await put(docs);
            f.state.cancelled = true;
        };
        await syncBatch(f.options);
        expect(await f.db.docs.count()).toBe(2);
        expect((await f.db.getLuminaryInternals(key))[0].pendingPage.after).toBeUndefined();
        f.state.cancelled = false;
        f.source.put = put;
        await syncBatch(f.options);
        expect(await f.db.docs.count()).toBe(3);
    });

    it("does not restore data or progress after clear while HTTP is in flight", async () => {
        const f = await fixture();
        const answer = f.http.post.getMockImplementation()!;
        f.http.post.mockImplementation(async (path, query) => {
            await f.db.clear();
            f.list.value = [];
            f.state.cancelled = true;
            return answer(path, query);
        });
        await syncBatch(f.options);
        expect(await f.db.docs.count()).toBe(0);
        expect(await f.db.getLuminaryInternals(key)).toBeUndefined();
    });

    it("does not checkpoint across a rapid cancel/resume transition", async () => {
        const f = await fixture();
        const answer = f.http.post.getMockImplementation()!;
        f.http.post.mockImplementation(async (path, query) => {
            setCancelSync(true);
            setCancelSync(false);
            return answer(path, query);
        });
        await syncBatch(f.options);
        expect(await f.db.docs.count()).toBe(0);
        expect((await f.db.getLuminaryInternals(key))[0].pendingPage.after).toBeUndefined();
    });

    it("replays instead of trusting a corrupt persisted tuple", async () => {
        const f = await fixture();
        await f.db.docs.put(documents()[0]);
        await f.db.setLuminaryInternals(key, [
            {
                chunkType: "viewed",
                memberOf: ["*"],
                blockStart: 0,
                blockEnd: 0,
                pendingPage: {
                    start: 1000,
                    end: 0,
                    queryKey: "bad",
                    after: { updatedTimeUtc: -1, id: "a" },
                },
            },
        ]);
        f.db.close();
        const next = await fixture(f.name);
        expect(next.list.value).toEqual([]);
        expect(await next.db.docs.count()).toBe(1);
        await syncBatch(next.options);
        expect(await next.db.docs.count()).toBe(3);
    });
    it("safely replays a durable page after checkpoint storage fails", async () => {
        const f = await fixture();
        const save = f.source.setSyncList;
        let saves = 0;
        f.source.setSyncList = async () => {
            if (++saves === 2) throw new Error("checkpoint failed");
            await save();
        };
        await expect(syncBatch(f.options)).rejects.toThrow("checkpoint failed");
        expect(await f.db.docs.count()).toBe(2);
        expect((await f.db.getLuminaryInternals(key))[0].pendingPage.after).toBeUndefined();
        f.db.close();
        const next = await fixture(f.name);
        await syncBatch(next.options);
        expect(await next.db.docs.count()).toBe(3);
        expect(next.http.post.mock.calls[0][1].syncPagination.after).toBeUndefined();
    });

    it("restarts a pending window if its query shape changes", async () => {
        const f = await fixture();
        const answer = f.http.post.getMockImplementation()!;
        f.http.post.mockImplementation(async (path, query) => {
            if (f.http.post.mock.calls.length === 2) throw new Error("interrupted");
            return answer(path, query);
        });
        await expect(syncBatch(f.options)).rejects.toThrow("interrupted");
        f.http.post.mockReset().mockImplementation(answer);
        f.options.limit = 3;
        await syncBatch(f.options);
        expect(f.http.post.mock.calls[0][1].syncPagination.after).toBeUndefined();
        expect(await f.db.docs.count()).toBe(3);
    });

    it("keeps an uncooperative full-page response incomplete", async () => {
        const f = await fixture();
        f.http.post.mockResolvedValue({ docs: documents().slice(1).reverse() });
        await expect(syncBatch(f.options)).rejects.toThrow("did not advance");
        expect(f.list.value[0].eof).toBe(false);
        expect((await f.db.getLuminaryInternals(key))[0].pendingPage.after.id).toBe("tie-b");
    });

    it("drops an in-flight page when its column membership is revoked", async () => {
        const f = await fixture();
        const answer = f.http.post.getMockImplementation()!;
        f.http.post.mockImplementation(async (path, query) => {
            f.list.value[0].memberOf = ["other-group"];
            return answer(path, query);
        });
        await syncBatch(f.options);
        expect(await f.db.docs.count()).toBe(0);
        expect((await f.db.getLuminaryInternals(key))[0].pendingPage.after).toBeUndefined();
    });

    it.each([401, 403, 429, 500, 503, 400])(
        "does not downgrade or advance on an unrelated HTTP error (%s)",
        async (status) => {
            tuplePaginationSupported.value = true;
            const f = await fixture();
            f.http.post.mockImplementation(async (_path, _query, callbacks) => {
                callbacks?.onError?.(status, "Invalid continuation or temporary failure");
                return undefined;
            });
            await expect(syncBatch(f.options)).rejects.toThrow("Invalid API response");
            expect(tuplePaginationSupported.value).toBe(true);
            expect(await f.db.docs.count()).toBe(0);
            expect((await f.db.getLuminaryInternals(key))[0].pendingPage.after).toBeUndefined();
        },
    );
});
