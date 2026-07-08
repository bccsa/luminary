import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// vi.hoisted runs before any imports, so we create the real Vue ref here.
// vitest supports require() against ESM packages via interop.
const mocks = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ref, shallowRef } = require("vue");
    // Live-mode test harness: the mocked useDexieLiveQuery returns a real
    // shallowRef per call (recorded in `liveRefs`) so a test can drive emissions
    // via `liveRefs[i].ref.value = [...]`. The real Vue `watch` inside HybridQuery
    // reacts to those assignments.
    const liveRefs: Array<{ ref: { value: any }; querier: any; options: any }> = [];
    // Socket harness: getSocket() returns a stable wrapper whose on/off mutate a
    // shared set of "data" handlers; emitSocket() invokes them with { docs }.
    const socketDataHandlers = new Set<(data: any) => void>();
    const socketMock = {
        on: (event: string, cb: (data: any) => void) => {
            if (event === "data") socketDataHandlers.add(cb);
        },
        off: (event: string, cb: (data: any) => void) => {
            if (event === "data") socketDataHandlers.delete(cb);
        },
    };
    return {
        mangoToDexieMock: vi.fn<(...args: any[]) => Promise<any[]>>(),
        docsTable: { _docsTableSentinel: true },
        bulkPut: vi.fn<(...args: any[]) => Promise<any[]>>(() => Promise.resolve([])),
        touchRetention: vi.fn<(ids: readonly string[]) => void>(),
        isSyncableDoc: vi.fn<(doc: any) => boolean>(() => true),
        isConnected: ref(true) as { value: boolean },
        // A REAL Vue ref (not a plain object): the cold-start re-route watches a
        // computed derived from `syncList`, which is only reactive over a real ref.
        syncList: ref([] as Array<{ chunkType: string }>) as {
            value: Array<{ chunkType: string }>;
        },
        cutoff: 1000,
        liveRefs,
        useDexieLiveQueryMock: vi.fn((querier: any, options: any) => {
            const r = shallowRef(options?.initialValue);
            liveRefs.push({ ref: r, querier, options });
            return r;
        }),
        validateDeleteCommandMock: vi.fn(() => true),
        // Stand-in for SharedConfig — `appLanguageIdsAsRef` (the synced language set) decides the
        // fallback-language supplement; `cms` gates the queryRemote scope-forwarding. Mutated per test.
        config: { appLanguageIdsAsRef: ref<string[]>([]), cms: false },
        socketDataHandlers,
        getSocketMock: vi.fn(() => socketMock),
        // Room subscription manager: subscribeRooms returns a fresh disposer per call so a
        // test can assert the non-synced live branch joins/leaves the type's rooms.
        subscribeRooms: vi.fn(() => vi.fn()),
        emitSocket: (docs: any[]) => {
            for (const h of [...socketDataHandlers]) h({ docs });
        },
    };
});

vi.mock("../../socket/socketio", () => ({
    isConnected: mocks.isConnected,
    getSocket: mocks.getSocketMock,
}));

vi.mock("../../socket/roomSubscriptions", () => ({
    subscribeRooms: mocks.subscribeRooms,
}));

vi.mock("../MangoQuery/mangoToDexie", () => ({
    mangoToDexie: mocks.mangoToDexieMock,
}));

vi.mock("../../db/database", () => ({
    db: {
        docs: mocks.docsTable,
        validateDeleteCommand: mocks.validateDeleteCommandMock,
        bulkPut: mocks.bulkPut,
    },
}));

vi.mock("../../db/retention", () => ({
    touchRetention: mocks.touchRetention,
}));

vi.mock("../../db/isSyncable", () => ({
    isSyncableDoc: mocks.isSyncableDoc,
}));

vi.mock("../../api/sync/state", () => ({
    syncList: mocks.syncList,
}));

vi.mock("../../config", () => ({
    // Read mocks.cutoff at call time so tests can change it per case.
    getContentPublishDateCutoff: () => mocks.cutoff,
    config: mocks.config,
    initConfig: () => {},
}));

// Live mode only. One-shot tests never call useDexieLiveQuery, so this mock is
// inert for them.
vi.mock("../useDexieLiveQuery/useDexieLiveQuery", () => ({
    useDexieLiveQuery: mocks.useDexieLiveQueryMock,
}));

// `hasLocalChanges` is a global outgoing-change-queue subscription, independent of the query
// under test; stub it so the constructor doesn't open the shared live query (which would
// perturb the useDexieLiveQuery / liveRefs harness above). Its own behaviour is covered by
// useHasLocalChange.spec.ts.
vi.mock("../useHasLocalChange", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { computed } = require("vue");
    return { useHasLocalChanges: () => computed(() => () => false) };
});

import { effectScope, nextTick, ref, watch } from "vue";
import { DocType } from "../../types";

import {
    _resetHybridQueryForTests,
    DEFAULT_REMOTE_QUERY_LIMIT,
    HybridQuery,
    initHybridQuery,
    queryRemote,
} from "./HybridQuery";
import {
    useSharedHybridQuery,
    sharedHybridQueryCount,
    _resetSharedHybridQueryForTests,
} from "./sharedHybridQuery";
import { readResponseCache, structuralCacheKey, writeResponseCache } from "./responseCache";
import { OPEN_MIN } from "../../api/sync/utils";

/** Drain pending micro/macrotasks + a tick so the background async work runs. */
const flush = async () => {
    await nextTick();
    await new Promise((r) => setTimeout(r));
};

describe("HybridQuery", () => {
    let postHttpMock: ReturnType<typeof vi.fn>;
    // Live instances own a persistent `isConnected` watcher (the socket listener
    // lifecycle). Track them so afterEach can dispose them — otherwise a leaked
    // watcher re-attaches its socket handler when a later test toggles isConnected.
    const liveInstances: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(q: T): T => {
        liveInstances.push(q);
        return q;
    };

    beforeEach(() => {
        // Clear the shared registry FIRST (stops each shared scope → disposes its instance)
        // so a shared instance from a prior test can't bleed into this one.
        _resetSharedHybridQueryForTests();
        _resetHybridQueryForTests();
        mocks.mangoToDexieMock.mockReset();
        mocks.isConnected.value = true;
        mocks.syncList.value = [];
        mocks.cutoff = 1000;
        mocks.config.appLanguageIdsAsRef.value = [];
        mocks.config.cms = false;
        mocks.useDexieLiveQueryMock.mockClear();
        mocks.liveRefs.length = 0;
        mocks.validateDeleteCommandMock.mockReset();
        mocks.validateDeleteCommandMock.mockReturnValue(true);
        mocks.bulkPut.mockClear();
        mocks.bulkPut.mockResolvedValue([]);
        mocks.touchRetention.mockClear();
        mocks.isSyncableDoc.mockReset();
        mocks.isSyncableDoc.mockReturnValue(true);
        mocks.getSocketMock.mockClear();
        mocks.socketDataHandlers.clear();
        mocks.subscribeRooms.mockClear();
        localStorage.clear();
        postHttpMock = vi.fn();
        initHybridQuery({ post: postHttpMock } as any);
    });

    afterEach(() => {
        liveInstances.forEach((q) => q.dispose());
        liveInstances.length = 0;
        vi.restoreAllMocks();
    });

    it("returns instance synchronously; output starts empty pre-flush", () => {
        mocks.mangoToDexieMock.mockResolvedValueOnce([]);
        const q = new HybridQuery({ selector: { type: "content" } });
        expect(q.output.value).toEqual([]);
    });

    it("provably-empty selector (empty $in) short-circuits: no Dexie read, no POST, no socket listener", async () => {
        const q = track(
            new HybridQuery(
                {
                    selector: {
                        $and: [{ type: "content" }, { parentTags: { $elemMatch: { $in: [] } } }],
                    },
                },
                { live: true },
            ),
        );
        await flush();

        expect(q.output.value).toEqual([]);
        expect(mocks.mangoToDexieMock).not.toHaveBeenCalled();
        expect(postHttpMock).not.toHaveBeenCalled();
        expect(mocks.getSocketMock).not.toHaveBeenCalled();
        expect(mocks.socketDataHandlers.size).toBe(0);
    });

    it("sanitizes a $in containing null so it never reaches Dexie or the API (would crash CouchDB)", async () => {
        // { parentId: { $in: [null] } } reaches CouchDB as $in:[null] and crashes
        // _find (function_clause / 500). _rebuild strips the null → $in:[] → the
        // provably-empty short-circuit above. No Dexie read, no POST.
        const q = track(
            new HybridQuery(
                {
                    selector: {
                        $and: [{ type: "content" }, { parentId: { $in: [null] } }],
                    },
                },
                { live: true },
            ),
        );
        await flush();

        expect(q.output.value).toEqual([]);
        expect(mocks.mangoToDexieMock).not.toHaveBeenCalled();
        expect(postHttpMock).not.toHaveBeenCalled();
    });

    describe("content routing", () => {
        it("no $limit + no _id list ⇒ always POSTs with publishDate <= cutoff", async () => {
            const local = [{ _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();

            expect(mocks.mangoToDexieMock).toHaveBeenCalledWith(mocks.docsTable, {
                selector: { type: "content" },
            });
            expect(postHttpMock).toHaveBeenCalledTimes(1);
            expect(postHttpMock).toHaveBeenCalledWith("query", {
                selector: { $and: [{ type: "content" }, { publishDate: { $lte: 1000 } }] },
                identifier: "hybridQuery",
                limit: DEFAULT_REMOTE_QUERY_LIMIT,
            });
            expect(q.output.value.map((d) => d._id)).toEqual(["a"]);
        });

        it("multi-parent $in ⇒ fans out into per-parent indexed POSTs and merges", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([]); // local empty
            postHttpMock
                .mockResolvedValueOnce({
                    docs: [
                        {
                            _id: "c1",
                            updatedTimeUtc: 1,
                            publishDate: 300,
                            type: "content",
                            parentId: "p1",
                        },
                    ],
                })
                .mockResolvedValueOnce({
                    docs: [
                        {
                            _id: "c2",
                            updatedTimeUtc: 2,
                            publishDate: 200,
                            type: "content",
                            parentId: "p2",
                        },
                    ],
                });

            const q = new HybridQuery({
                selector: { $and: [{ type: "content" }, { parentId: { $in: ["p1", "p2"] } }] },
                $sort: [{ publishDate: "desc" as const }],
            });
            await flush();

            // One POST per parent, each pinned to the parentId index with a single-parent
            // (equality, not $in) selector.
            expect(postHttpMock).toHaveBeenCalledTimes(2);
            const payloads = postHttpMock.mock.calls.map((c) => c[1] as any);
            const postedParents: string[] = [];
            for (const p of payloads) {
                expect(p.use_index).toBe("content-parentId-publishDate-index");
                const parentCond = (p.selector.$and as any[]).find((c) => "parentId" in c);
                expect(typeof parentCond.parentId).toBe("string");
                postedParents.push(parentCond.parentId);
            }
            expect(postedParents.sort()).toEqual(["p1", "p2"]);

            // Merged by id and sorted publishDate-desc.
            expect(q.output.value.map((d) => d._id)).toEqual(["c1", "c2"]);
        });

        it("more than the fan-out cap ⇒ falls back to a single $in POST", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });
            const many = Array.from({ length: 30 }, (_, i) => "p" + i);

            new HybridQuery({
                selector: { $and: [{ type: "content" }, { parentId: { $in: many } }] },
            });
            await flush();

            expect(postHttpMock).toHaveBeenCalledTimes(1);
            const payload = postHttpMock.mock.calls[0]![1] as any;
            // use_index left as-is (not repointed) and the $in preserved.
            expect(payload.use_index).toBeUndefined();
            const parentCond = (payload.selector.$and as any[]).find((c) => "parentId" in c);
            expect(parentCond.parentId).toEqual({ $in: many });
        });

        it("one fan-out POST failing ⇒ keeps the parents that succeeded (allSettled)", async () => {
            const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            mocks.mangoToDexieMock.mockResolvedValueOnce([]); // local empty
            postHttpMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({
                docs: [
                    {
                        _id: "c2",
                        updatedTimeUtc: 2,
                        publishDate: 200,
                        type: "content",
                        parentId: "p2",
                    },
                ],
            });

            const q = new HybridQuery({
                selector: { $and: [{ type: "content" }, { parentId: { $in: ["p1", "p2"] } }] },
                $sort: [{ publishDate: "desc" as const }],
            });
            await flush();

            expect(postHttpMock).toHaveBeenCalledTimes(2);
            // The surviving parent's doc is present despite the other POST failing.
            expect(q.output.value.map((d) => d._id)).toEqual(["c2"]);
            expect(errSpy).toHaveBeenCalled();
            errSpy.mockRestore();
        });

        it("all fan-out POSTs failing ⇒ preserves local, no crash", async () => {
            const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "L", updatedTimeUtc: 9, publishDate: 500, type: "content" },
            ]);
            postHttpMock
                .mockRejectedValueOnce(new Error("boom1"))
                .mockRejectedValueOnce(new Error("boom2"));

            const q = new HybridQuery({
                selector: { $and: [{ type: "content" }, { parentId: { $in: ["p1", "p2"] } }] },
                $sort: [{ publishDate: "desc" as const }],
            });
            await flush();

            expect(postHttpMock).toHaveBeenCalledTimes(2);
            expect(q.output.value.map((d) => d._id)).toEqual(["L"]);
            errSpy.mockRestore();
        });

        it("$limit satisfied locally ⇒ no POST", async () => {
            const local = Array.from({ length: 10 }, (_, i) => ({
                _id: String(i),
                updatedTimeUtc: i,
                publishDate: 2000 + i,
                type: "content",
            }));
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);

            new HybridQuery({ selector: { type: "content" }, $limit: 10 });
            await flush();

            expect(postHttpMock).not.toHaveBeenCalled();
        });

        it("$limit shortfall ⇒ POST $limit = limit − local.length + publishDate $lte cutoff", async () => {
            const local = [
                { _id: "a", updatedTimeUtc: 1, publishDate: 3000, type: "content" },
                { _id: "b", updatedTimeUtc: 2, publishDate: 2500, type: "content" },
                { _id: "c", updatedTimeUtc: 3, publishDate: 2000, type: "content" },
                { _id: "d", updatedTimeUtc: 4, publishDate: 1500, type: "content" },
            ];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);
            postHttpMock.mockResolvedValueOnce({
                docs: [{ _id: "e", updatedTimeUtc: 5, publishDate: 500, type: "content" }],
            });

            const q = new HybridQuery({
                selector: { type: "content" },
                $sort: [{ publishDate: "desc" as const }],
                $limit: 10,
            });
            await flush();

            expect(postHttpMock).toHaveBeenCalledWith("query", {
                selector: { $and: [{ type: "content" }, { publishDate: { $lte: 1000 } }] },
                identifier: "hybridQuery",
                limit: 6,
                sort: [{ publishDate: "desc" }],
            });
            // End-to-end: merged + sorted desc + limit 10 ⇒ all 5 in publishDate-desc order.
            expect(q.output.value.map((d) => d._id)).toEqual(["a", "b", "c", "d", "e"]);
        });

        it("$limit shortfall over-by-one (local > $limit) ⇒ no POST and no negative remote limit", async () => {
            // Defensive: if mangoToDexie ever returns more than $limit, the
            // `>=` short-circuit must hold so the API never sees `limit: -N`.
            const local = Array.from({ length: 11 }, (_, i) => ({
                _id: String(i),
                updatedTimeUtc: i,
                publishDate: 2000 + i,
                type: "content",
            }));
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);

            new HybridQuery({ selector: { type: "content" }, $limit: 10 });
            await flush();

            expect(postHttpMock).not.toHaveBeenCalled();
        });

        it("id-list fully local ⇒ no POST", async () => {
            const local = [
                { _id: "a", updatedTimeUtc: 1, type: "content" },
                { _id: "b", updatedTimeUtc: 2, type: "content" },
            ];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);

            new HybridQuery({
                selector: { type: "content", _id: { $in: ["a", "b"] } },
            });
            await flush();

            expect(postHttpMock).not.toHaveBeenCalled();
        });

        it("id-diff ⇒ POST narrowed _id with missing ids + publishDate $lte cutoff, no sort/limit", async () => {
            const local = [{ _id: "a", updatedTimeUtc: 1, type: "content" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            new HybridQuery({
                selector: { type: "content", _id: { $in: ["a", "b", "c"] } },
            });
            await flush();

            expect(postHttpMock).toHaveBeenCalledTimes(1);
            const call = postHttpMock.mock.calls[0]!;
            expect(call[0]).toBe("query");
            const payload = call[1] as Record<string, unknown>;
            expect(payload.identifier).toBe("hybridQuery");
            expect(payload.limit).toBe(DEFAULT_REMOTE_QUERY_LIMIT); // no $limit ⇒ default
            expect("sort" in payload).toBe(false); // no $sort
            const sel = payload.selector as { $and: any[] };
            // Length assertion catches a regression where the original `_id: {$in: [a,b,c]}`
            // clause is left in place AND the narrowed clause appended.
            expect(sel.$and).toHaveLength(3);
            expect(sel.$and).toContainEqual({ type: "content" });
            expect(sel.$and).toContainEqual({ _id: { $in: ["b", "c"] } });
            expect(sel.$and).toContainEqual({ publishDate: { $lte: 1000 } });
        });

        it("cutoff === OPEN_MIN ⇒ no POST (full sync, local read is complete)", async () => {
            // No cutoff configured: sync syncs all content, so the local read is
            // complete and the supplement POST (publishDate <= OPEN_MIN) would match
            // nothing. decideContentApiQuery short-circuits before the always-post
            // branch — no wasted round-trip.
            mocks.cutoff = OPEN_MIN;
            const local = [{ _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();

            expect(postHttpMock).not.toHaveBeenCalled();
            expect(q.output.value.map((d) => d._id)).toEqual(["a"]);
        });

        it("cutoff === 0 ⇒ literal cutoff honored (POSTs publishDate <= 0)", async () => {
            // 0 is NOT the OPEN_MIN sentinel — it's a real cutoff. The guard
            // (=== OPEN_MIN) must NOT fire: the supplement still POSTs publishDate
            // <= 0 verbatim, and the local + remote sets merge into a complete view.
            mocks.cutoff = 0;
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
            ]);
            postHttpMock.mockResolvedValueOnce({
                docs: [{ _id: "tail", updatedTimeUtc: 1, publishDate: -50, type: "content" }],
            });

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();

            expect(postHttpMock).toHaveBeenCalledTimes(1);
            expect(postHttpMock).toHaveBeenCalledWith("query", {
                selector: { $and: [{ type: "content" }, { publishDate: { $lte: 0 } }] },
                identifier: "hybridQuery",
                limit: DEFAULT_REMOTE_QUERY_LIMIT,
            });
            expect(q.output.value.map((d) => d._id).sort()).toEqual(["a", "tail"]);
        });

        it("cutoff negative (not OPEN_MIN) ⇒ literal cutoff honored (POSTs publishDate <= -1)", async () => {
            // A negative-but-not-sentinel cutoff is still a real cutoff. Pins that
            // only the exact OPEN_MIN sentinel short-circuits the supplement.
            mocks.cutoff = -1;
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
            ]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();

            expect(postHttpMock).toHaveBeenCalledTimes(1);
            expect(postHttpMock).toHaveBeenCalledWith("query", {
                selector: { $and: [{ type: "content" }, { publishDate: { $lte: -1 } }] },
                identifier: "hybridQuery",
                limit: DEFAULT_REMOTE_QUERY_LIMIT,
            });
            expect(q.output.value.map((d) => d._id)).toEqual(["a"]);
        });
    });

    describe("non-content routing", () => {
        it("type in syncList ⇒ Dexie only, no POST", async () => {
            mocks.syncList.value = [{ chunkType: "group" }];
            const local = [{ _id: "g1", updatedTimeUtc: 1, type: "group" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);

            const q = new HybridQuery({ selector: { type: "group" } });
            await flush();

            expect(mocks.mangoToDexieMock).toHaveBeenCalled();
            expect(postHttpMock).not.toHaveBeenCalled();
            expect(q.output.value).toEqual(local);
        });

        it("type NOT in syncList ⇒ API only, no Dexie read", async () => {
            // syncList stays empty
            postHttpMock.mockResolvedValueOnce({
                docs: [{ _id: "r1", updatedTimeUtc: 1, type: "redirect" }],
            });

            const q = new HybridQuery({ selector: { type: "redirect" } });
            await flush();

            expect(mocks.mangoToDexieMock).not.toHaveBeenCalled();
            expect(postHttpMock).toHaveBeenCalledTimes(1);
            // whole original query is forwarded (no publishDate clause appended)
            expect(postHttpMock).toHaveBeenCalledWith("query", {
                selector: { type: "redirect" },
                identifier: "hybridQuery",
                limit: DEFAULT_REMOTE_QUERY_LIMIT,
            });
            expect(q.output.value.map((d) => d._id)).toEqual(["r1"]);
        });
    });

    describe("non-content cold-start re-route", () => {
        it("API-only with empty syncList re-routes to Dexie-only when the type registers", async () => {
            // Cold start: built before `group` is synced ⇒ API-only.
            postHttpMock.mockResolvedValueOnce({
                docs: [{ _id: "g1", updatedTimeUtc: 1, type: "group" }],
            });
            const q = track(new HybridQuery({ selector: { type: "group" } }));
            await flush();

            expect(postHttpMock).toHaveBeenCalledTimes(1);
            expect(mocks.mangoToDexieMock).not.toHaveBeenCalled();
            expect(q.output.value.map((d) => d._id)).toEqual(["g1"]);

            // Sync registers `group` (in production db.bulkPut precedes this push, so
            // Dexie already holds the doc) ⇒ membership flips true ⇒ re-route Dexie-only.
            const local = [{ _id: "g1", updatedTimeUtc: 1, type: "group" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);
            mocks.syncList.value = [{ chunkType: "group" }];
            await flush();

            expect(mocks.mangoToDexieMock).toHaveBeenCalledTimes(1); // now reads Dexie
            expect(postHttpMock).toHaveBeenCalledTimes(1); // no new POST
            expect(q.output.value).toEqual(local);
        });

        it("does NOT re-route on syncList churn that leaves membership unchanged", async () => {
            mocks.syncList.value = [{ chunkType: "group" }];
            mocks.mangoToDexieMock.mockResolvedValue([
                { _id: "g1", updatedTimeUtc: 1, type: "group" },
            ]);
            track(new HybridQuery({ selector: { type: "group" } }));
            await flush();
            expect(mocks.mangoToDexieMock).toHaveBeenCalledTimes(1); // Dexie-only

            // Per-chunk churn: add another `group` column, then an unrelated type. The
            // `group` membership boolean stays true throughout ⇒ no rebuild. This is the
            // "watch the boolean, not the array" guarantee.
            mocks.syncList.value = [{ chunkType: "group" }, { chunkType: "group" }];
            await flush();
            mocks.syncList.value = [{ chunkType: "group" }, { chunkType: "post" }];
            await flush();

            expect(mocks.mangoToDexieMock).toHaveBeenCalledTimes(1); // no extra Dexie read
            expect(postHttpMock).not.toHaveBeenCalled();
        });

        it("content query never re-routes on syncList membership changes", async () => {
            mocks.cutoff = OPEN_MIN; // no API supplement ⇒ a single local read, no POST
            mocks.mangoToDexieMock.mockResolvedValue([
                { _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
            ]);
            track(new HybridQuery({ selector: { type: "content" } }));
            await flush();
            const dexieCallsBefore = mocks.mangoToDexieMock.mock.calls.length;

            // Toggle content membership: the content branch must not watch it.
            mocks.syncList.value = [{ chunkType: "content:post" }];
            await flush();
            mocks.syncList.value = [];
            await flush();

            expect(mocks.mangoToDexieMock.mock.calls.length).toBe(dexieCallsBefore);
            expect(postHttpMock).not.toHaveBeenCalled();
        });

        it("re-route does not flash output through empty (Dexie already holds the column)", async () => {
            const docs = [{ _id: "g1", updatedTimeUtc: 1, type: "group" }];
            postHttpMock.mockResolvedValueOnce({ docs });
            const q = track(new HybridQuery({ selector: { type: "group" } }));
            await flush();
            expect(q.output.value.map((d) => d._id)).toEqual(["g1"]);

            const snapshots: string[][] = [];
            const stop = watch(q.output, (v) => snapshots.push(v.map((d) => d._id)), {
                flush: "sync",
            });

            mocks.mangoToDexieMock.mockResolvedValueOnce(docs);
            mocks.syncList.value = [{ chunkType: "group" }];
            await flush();
            stop();

            expect(q.output.value.map((d) => d._id)).toEqual(["g1"]);
            // output is kept across the rebuild; any emission that did occur was non-empty.
            expect(snapshots.every((s) => s.length > 0)).toBe(true);
        });

        it("revoke: Dexie-only re-routes to API-only when the type leaves syncList", async () => {
            mocks.syncList.value = [{ chunkType: "group" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "g1", updatedTimeUtc: 1, type: "group" },
            ]);
            track(new HybridQuery({ selector: { type: "group" } }));
            await flush();
            expect(postHttpMock).not.toHaveBeenCalled(); // Dexie-only

            // Access revoked ⇒ deleteRevoked trims the column (and purges the docs).
            postHttpMock.mockResolvedValueOnce({ docs: [] });
            mocks.syncList.value = [];
            await flush();

            expect(postHttpMock).toHaveBeenCalledTimes(1); // now API-only
        });

        it("typeless query ($or across types) gets no membership watch — stays API-only", async () => {
            postHttpMock.mockResolvedValue({ docs: [] });
            track(
                new HybridQuery({
                    selector: { $or: [{ type: "group" }, { type: "language" }] },
                }),
            );
            await flush();
            expect(postHttpMock).toHaveBeenCalledTimes(1);
            expect(mocks.mangoToDexieMock).not.toHaveBeenCalled();

            // Registering `group` must NOT re-route (readType → undefined ⇒ no watch).
            mocks.syncList.value = [{ chunkType: "group" }];
            await flush();

            expect(mocks.mangoToDexieMock).not.toHaveBeenCalled();
            expect(postHttpMock).toHaveBeenCalledTimes(1);
        });
    });

    describe("shared instances (useSharedHybridQuery)", () => {
        it("identical (query, options) callers share ONE instance and one cold-start POST", async () => {
            postHttpMock.mockResolvedValue({
                docs: [{ _id: "l1", updatedTimeUtc: 1, type: "language" }],
            });
            // syncList empty → API-only. A static caller and a thunk caller whose value is
            // structurally identical must collapse to the SAME instance.
            const a = useSharedHybridQuery({ selector: { type: "language" } }, { live: true });
            const b = useSharedHybridQuery(() => ({ selector: { type: "language" } }), {
                live: true,
            });
            await flush();

            expect(a).toBe(b); // same output ref
            expect(sharedHybridQueryCount()).toBe(1);
            expect(postHttpMock).toHaveBeenCalledTimes(1); // ONE POST despite two subscribers
        });

        it("different query VALUE → different instances (no template collision)", async () => {
            postHttpMock.mockResolvedValue({ docs: [] });
            useSharedHybridQuery({ selector: { type: "language" } }, { live: true });
            useSharedHybridQuery({ selector: { type: "group" } }, { live: true });
            await flush();
            expect(sharedHybridQueryCount()).toBe(2);
        });

        it("different output-affecting options → different instances", async () => {
            postHttpMock.mockResolvedValue({ docs: [] });
            useSharedHybridQuery({ selector: { type: "language" } }, { live: true });
            useSharedHybridQuery(
                { selector: { type: "language" } },
                { live: true, stripFields: ["translations"] },
            );
            await flush();
            expect(sharedHybridQueryCount()).toBe(2);
        });
    });

    describe("offline / reconnect / dispose", () => {
        it("offline at start ⇒ no POST; flipping isConnected=true ⇒ exactly one POST; flap ⇒ no 2nd", async () => {
            mocks.isConnected.value = false;
            mocks.mangoToDexieMock.mockResolvedValueOnce([]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            new HybridQuery({ selector: { type: "content" } });
            await flush();
            expect(postHttpMock).not.toHaveBeenCalled();

            mocks.isConnected.value = true;
            await flush();
            expect(postHttpMock).toHaveBeenCalledTimes(1);

            mocks.isConnected.value = false;
            await flush();
            mocks.isConnected.value = true;
            await flush();
            expect(postHttpMock).toHaveBeenCalledTimes(1); // run-once guard
        });

        it("dispose() cancels a still-pending reconnect watcher (no POST after reconnect)", async () => {
            mocks.isConnected.value = false;
            mocks.mangoToDexieMock.mockResolvedValueOnce([]);

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();
            q.dispose();

            mocks.isConnected.value = true;
            await flush();
            expect(postHttpMock).not.toHaveBeenCalled();
        });

        it("dispose() is idempotent", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });
            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();
            expect(() => {
                q.dispose();
                q.dispose();
            }).not.toThrow();
        });

        it("auto-disposes when the owning effect scope stops (onScopeDispose wiring)", async () => {
            // Positive control first: same setup WITHOUT scope.stop must POST,
            // proving the watcher IS registered while offline.
            mocks.isConnected.value = false;
            mocks.mangoToDexieMock.mockResolvedValueOnce([]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            const liveScope = effectScope();
            liveScope.run(() => {
                new HybridQuery({ selector: { type: "content" } });
            });
            await flush();
            mocks.isConnected.value = true;
            await flush();
            expect(postHttpMock).toHaveBeenCalledTimes(1); // positive control
            liveScope.stop();

            // Now the real assertion: scope.stop BEFORE reconnect cancels the watcher.
            mocks.isConnected.value = false;
            mocks.mangoToDexieMock.mockResolvedValueOnce([]);
            postHttpMock.mockClear();

            const stoppedScope = effectScope();
            stoppedScope.run(() => {
                new HybridQuery({ selector: { type: "content" } });
            });
            await flush();
            stoppedScope.stop();

            mocks.isConnected.value = true;
            await flush();
            expect(postHttpMock).not.toHaveBeenCalled();
        });

        it("dispose() during an in-flight POST prevents the late merge from mutating output", async () => {
            // Setup: online, content branch ⇒ local read merges first, then API
            // POST is pending. dispose() before queryRemote resolves must prevent
            // the late _merge from touching output.
            const local = [{ _id: "local", updatedTimeUtc: 1, type: "content" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);
            let resolvePost!: (v: any) => void;
            postHttpMock.mockReturnValueOnce(new Promise((res) => (resolvePost = res)));

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();
            // Local read landed; remote in flight.
            expect(q.output.value).toEqual(local);

            q.dispose();
            resolvePost({
                docs: [{ _id: "late", updatedTimeUtc: 2, type: "content" }],
            });
            await flush();

            // Output must NOT have been mutated by the late merge.
            expect(q.output.value).toEqual(local);
            expect(q.output.value.map((d) => d._id)).not.toContain("late");
        });
    });

    describe("merge / output", () => {
        it("UNION not replace: a local-only doc above cutoff survives a remote merge", async () => {
            const local = [{ _id: "fresh", updatedTimeUtc: 9, publishDate: 5000, type: "content" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);
            postHttpMock.mockResolvedValueOnce({
                docs: [{ _id: "old", updatedTimeUtc: 1, publishDate: 100, type: "content" }],
            });

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();

            const ids = q.output.value.map((d) => d._id).sort();
            expect(ids).toEqual(["fresh", "old"]);
        });

        it("dedups by _id (latest updatedTimeUtc wins), re-sorts, re-limits", async () => {
            // Local has 1 doc; $limit:2 ⇒ shortfall ⇒ POST runs. Remote returns
            // a newer version of "a" plus a fresh "b" — merged result is the
            // limit-2 desc-publishDate window with "a" replaced by the newer copy.
            const local = [{ _id: "a", updatedTimeUtc: 5, publishDate: 30, type: "content" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);
            postHttpMock.mockResolvedValueOnce({
                docs: [
                    { _id: "b", updatedTimeUtc: 2, publishDate: 20, type: "content" },
                    { _id: "a", updatedTimeUtc: 9, publishDate: 30, type: "content" }, // newer
                ],
            });

            const q = new HybridQuery({
                selector: { type: "content" },
                $sort: [{ publishDate: "desc" as const }],
                $limit: 2,
            });
            await flush();

            expect(q.output.value.map((d) => d._id)).toEqual(["a", "b"]);
            expect(q.output.value.find((d) => d._id === "a")?.updatedTimeUtc).toBe(9);
        });

        it("empty remote response is a harmless no-op merge", async () => {
            const local = [{ _id: "a", updatedTimeUtc: 1, type: "content" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);
            postHttpMock.mockResolvedValueOnce({}); // no docs field

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();

            expect(q.output.value).toEqual(local);
        });

        it("remote failure keeps local and logs", async () => {
            const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            const local = [{ _id: "a", updatedTimeUtc: 1, type: "content" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);
            postHttpMock.mockRejectedValueOnce(new Error("boom"));

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();

            expect(q.output.value).toEqual(local);
            expect(errSpy).toHaveBeenCalled();
        });

        // HttpReq returns undefined on a 4xx (e.g. a 403 from a missing CmsView grant). Treating
        // that as an empty remote result would clobber the local docs; it must reject instead.
        it("undefined remote response (4xx) keeps local and logs, rather than emptying the result", async () => {
            const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            const local = [{ _id: "a", updatedTimeUtc: 1, type: "content" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);
            postHttpMock.mockResolvedValueOnce(undefined);

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();

            expect(q.output.value).toEqual(local);
            expect(errSpy).toHaveBeenCalled();
        });

        it("logs (does not crash) when HTTP service is not wired", async () => {
            const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            _resetHybridQueryForTests(); // un-wire
            const local = [{ _id: "a", updatedTimeUtc: 1, type: "content" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();

            expect(q.output.value).toEqual(local);
            expect(errSpy).toHaveBeenCalled();
        });
    });

    describe("use_index forwarding", () => {
        it("forwards a caller-supplied use_index to the POST payload (always-post branch)", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            new HybridQuery({
                selector: { type: "content" },
                use_index: "content-publishDate-index",
            });
            await flush();

            const payload = postHttpMock.mock.calls[0]![1] as Record<string, unknown>;
            expect(payload.use_index).toBe("content-publishDate-index");
        });

        it("forwards use_index on the limit-shortfall branch", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "a", updatedTimeUtc: 1, publishDate: 9999, type: "content" },
            ]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            new HybridQuery({
                selector: { type: "content" },
                $sort: [{ publishDate: "desc" as const }],
                $limit: 10,
                use_index: "content-publishDate-index",
            });
            await flush();

            const payload = postHttpMock.mock.calls[0]![1] as Record<string, unknown>;
            expect(payload.use_index).toBe("content-publishDate-index");
        });

        it("drops use_index on the id-diff branch (sort-oriented hint doesn't apply to _id lookup)", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "a", updatedTimeUtc: 1, type: "content" },
            ]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            new HybridQuery({
                selector: { type: "content", _id: { $in: ["a", "b"] } },
                use_index: "content-publishDate-index",
            });
            await flush();

            const payload = postHttpMock.mock.calls[0]![1] as Record<string, unknown>;
            expect(payload.use_index).toBeUndefined();
        });

        it("omits use_index from the payload when the caller didn't set one", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            new HybridQuery({ selector: { type: "content" } });
            await flush();

            const payload = postHttpMock.mock.calls[0]![1] as Record<string, unknown>;
            expect("use_index" in payload).toBe(false);
        });
    });

    describe("cutoff threading", () => {
        // Parameterize across the three content sub-branches so a regression that
        // hard-codes the cutoff (or reads it at module-load) would fail at least
        // one variant.
        it.each<[string, () => HybridQuery<any>]>([
            [
                "always-post (no limit, no id list)",
                () => new HybridQuery({ selector: { type: "content" } }),
            ],
            [
                "limit-shortfall",
                () =>
                    new HybridQuery({
                        selector: { type: "content" },
                        $sort: [{ publishDate: "desc" as const }],
                        $limit: 10,
                    }),
            ],
            [
                "id-diff",
                () =>
                    new HybridQuery({
                        selector: { type: "content", _id: { $in: ["a", "b"] } },
                    }),
            ],
        ])("uses getContentPublishDateCutoff() verbatim — %s", async (_label, build) => {
            mocks.cutoff = 42_000_000;
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "local", updatedTimeUtc: 1, type: "content" },
            ]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            build();
            await flush();

            expect(postHttpMock).toHaveBeenCalledTimes(1);
            const payload = postHttpMock.mock.calls[0]![1] as { selector: { $and: any[] } };
            expect(payload.selector.$and).toContainEqual({
                publishDate: { $lte: 42_000_000 },
            });
        });
    });

    describe("live mode", () => {
        /** Push a new local emission and let watch + downstream async settle. */
        const emit = async (docs: any[]) => {
            mocks.liveRefs[0]!.ref.value = docs;
            await flush();
        };

        it("uses useDexieLiveQuery (not a direct mangoToDexie read) for the local source", async () => {
            new HybridQuery({ selector: { type: "content" } }, { live: true });
            await flush();

            expect(mocks.useDexieLiveQueryMock).toHaveBeenCalledTimes(1);
            expect(mocks.mangoToDexieMock).not.toHaveBeenCalled(); // the querier is held by the mock, not invoked
        });

        it("cutoff === OPEN_MIN ⇒ no POST and no live supplement listener (full sync)", async () => {
            // Full sync: decideContentApiQuery returns undefined, so the content
            // branch takes the `_dropSeededRemote` path — _startRemoteLive (which
            // is guarded behind a supplement query) never attaches. Live reactivity
            // still flows through useDexieLiveQuery on the local source.
            mocks.cutoff = OPEN_MIN;

            const q = track(new HybridQuery({ selector: { type: "content" } }, { live: true }));
            await emit([{ _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" }]);

            expect(postHttpMock).not.toHaveBeenCalled();
            expect(mocks.socketDataHandlers.size).toBe(0); // no supplement listener
            expect(q.output.value.map((d) => d._id)).toEqual(["a"]);

            // A later local emission still re-merges (local source stays reactive).
            await emit([
                { _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
                { _id: "b", updatedTimeUtc: 6, publishDate: 3000, type: "content" },
            ]);
            expect(q.output.value.map((d) => d._id).sort()).toEqual(["a", "b"]);
        });

        it("content: first emission decides the API once; later emissions re-merge without re-POST; deletions drop", async () => {
            postHttpMock.mockResolvedValueOnce({
                docs: [{ _id: "old", updatedTimeUtc: 1, publishDate: 100, type: "content" }],
            });

            const q = track(
                new HybridQuery(
                    { selector: { type: "content" }, $sort: [{ publishDate: "desc" as const }] },
                    { live: true },
                ),
            );
            await flush();
            expect(q.output.value).toEqual([]); // no emission yet

            // First emission ⇒ API decided off [a]; merged + sorted desc.
            await emit([{ _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" }]);
            expect(postHttpMock).toHaveBeenCalledTimes(1);
            expect(q.output.value.map((d) => d._id)).toEqual(["a", "old"]);

            // Second emission adds "b" ⇒ no new POST, output re-merges through sort.
            await emit([
                { _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
                { _id: "b", updatedTimeUtc: 6, publishDate: 1500, type: "content" },
            ]);
            expect(postHttpMock).toHaveBeenCalledTimes(1);
            expect(q.output.value.map((d) => d._id)).toEqual(["a", "b", "old"]);

            // Third emission drops "b" (local delete) ⇒ falls out of output, still no POST.
            await emit([{ _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" }]);
            expect(postHttpMock).toHaveBeenCalledTimes(1);
            expect(q.output.value.map((d) => d._id)).toEqual(["a", "old"]);
        });

        it("content: API decision gated even when the first emission needs no API ($limit satisfied)", async () => {
            const q = new HybridQuery(
                {
                    selector: { type: "content" },
                    $sort: [{ publishDate: "desc" as const }],
                    $limit: 1,
                },
                { live: true },
            );
            await flush();

            // First emission already satisfies $limit ⇒ no POST, but the gate must close.
            await emit([{ _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" }]);
            expect(postHttpMock).not.toHaveBeenCalled();

            // A later emission that would now be a shortfall must NOT trigger a POST
            // (live updates from the API are excluded this phase).
            await emit([]);
            expect(postHttpMock).not.toHaveBeenCalled();
            expect(q.output.value).toEqual([]);
        });

        it("syncList type: emissions update output, never POST", async () => {
            mocks.syncList.value = [{ chunkType: "group" }];

            const q = new HybridQuery({ selector: { type: "group" } }, { live: true });
            await flush();

            await emit([{ _id: "g1", updatedTimeUtc: 1, type: "group" }]);
            expect(postHttpMock).not.toHaveBeenCalled();
            expect(q.output.value.map((d) => d._id)).toEqual(["g1"]);

            await emit([
                { _id: "g1", updatedTimeUtc: 1, type: "group" },
                { _id: "g2", updatedTimeUtc: 2, type: "group" },
            ]);
            expect(q.output.value.map((d) => d._id)).toEqual(["g1", "g2"]);
        });

        it("dispose() stops the subscription: a post-dispose emission does not mutate output", async () => {
            mocks.syncList.value = [{ chunkType: "group" }];

            const q = new HybridQuery({ selector: { type: "group" } }, { live: true });
            await flush();
            await emit([{ _id: "g1", updatedTimeUtc: 1, type: "group" }]);
            expect(q.output.value.map((d) => d._id)).toEqual(["g1"]);

            q.dispose();

            await emit([
                { _id: "g1", updatedTimeUtc: 1, type: "group" },
                { _id: "g2", updatedTimeUtc: 2, type: "group" },
            ]);
            expect(q.output.value.map((d) => d._id)).toEqual(["g1"]); // unchanged
        });
    });

    describe("socket live", () => {
        // Build a live content query whose API supplement is decided (so the socket
        // listener attaches), driving the first local emission with `firstLocal`.
        const setupContentLive = async (
            firstLocal: any[] = [],
            query: any = {
                selector: { type: "content" },
                $sort: [{ publishDate: "desc" as const }],
            },
        ) => {
            postHttpMock.mockResolvedValue({ docs: [] }); // one-shot supplement: nothing
            const q = track(new HybridQuery(query, { live: true }));
            await flush();
            mocks.liveRefs[0]!.ref.value = firstLocal; // first emission ⇒ api decision + listener
            await flush();
            return q;
        };
        const del = (docId: string, updatedTimeUtc: number) => ({
            _id: `del-${docId}-${updatedTimeUtc}`,
            type: DocType.DeleteCmd,
            docType: "content",
            docId,
            updatedTimeUtc,
        });

        it("attaches one listener; a matching doc upserts into _remote → output", async () => {
            const q = await setupContentLive();
            expect(mocks.socketDataHandlers.size).toBe(1);

            mocks.emitSocket([{ _id: "x", type: "content", publishDate: 500, updatedTimeUtc: 5 }]);
            expect(q.output.value.map((d) => d._id)).toEqual(["x"]);
        });

        it("ignores a doc that doesn't match the supplement selector (early-out, no mutation)", async () => {
            const q = await setupContentLive([
                { _id: "a", type: "content", publishDate: 2000, updatedTimeUtc: 5 },
            ]);
            const ref1 = q.output.value;
            // publishDate 5000 > cutoff 1000 ⇒ fails matchP ⇒ early-out before recompute.
            mocks.emitSocket([{ _id: "y", type: "content", publishDate: 5000, updatedTimeUtc: 6 }]);
            expect(q.output.value).toBe(ref1); // same reference — nothing mutated
            expect(q.output.value.map((d) => d._id)).toEqual(["a"]);
        });

        it("a valid DeleteCmd removes a remote-sourced doc; a stale one is ignored", async () => {
            const q = await setupContentLive();
            mocks.emitSocket([{ _id: "r", type: "content", publishDate: 500, updatedTimeUtc: 5 }]);
            expect(q.output.value.map((d) => d._id)).toEqual(["r"]);

            mocks.emitSocket([del("r", 3)]); // older than our copy ⇒ stale guard skips
            expect(q.output.value.map((d) => d._id)).toEqual(["r"]);

            mocks.emitSocket([del("r", 9)]); // newer ⇒ removed
            expect(q.output.value).toEqual([]);
        });

        it("a DeleteCmd removes a locally-sourced doc too", async () => {
            const q = await setupContentLive([
                { _id: "x", type: "content", publishDate: 500, updatedTimeUtc: 5 },
            ]);
            expect(q.output.value.map((d) => d._id)).toEqual(["x"]);
            mocks.emitSocket([del("x", 10)]);
            expect(q.output.value).toEqual([]);
        });

        it("validateDeleteCommand === false blocks the delete", async () => {
            const q = await setupContentLive([
                { _id: "x", type: "content", publishDate: 500, updatedTimeUtc: 5 },
            ]);
            mocks.validateDeleteCommandMock.mockReturnValue(false);
            mocks.emitSocket([del("x", 10)]);
            expect(q.output.value.map((d) => d._id)).toEqual(["x"]); // not deleted
        });

        it("tombstone: suppresses a re-emitted stale local doc, then releases when Dexie catches up", async () => {
            const q = await setupContentLive([
                { _id: "x", type: "content", publishDate: 500, updatedTimeUtc: 5 },
            ]);
            mocks.emitSocket([del("x", 10)]);
            expect(q.output.value).toEqual([]);

            // Dexie not caught up: a local re-emission still holds x ⇒ tombstone suppresses it.
            mocks.liveRefs[0]!.ref.value = [
                { _id: "x", type: "content", publishDate: 500, updatedTimeUtc: 5 },
            ];
            await flush();
            expect(q.output.value).toEqual([]);

            // Dexie caught up: emission without x ⇒ tombstone released.
            mocks.liveRefs[0]!.ref.value = [];
            await flush();
            expect(q.output.value).toEqual([]);

            // Proof the tombstone is gone: x can reappear (e.g. republished + re-synced).
            mocks.liveRefs[0]!.ref.value = [
                { _id: "x", type: "content", publishDate: 500, updatedTimeUtc: 5 },
            ];
            await flush();
            expect(q.output.value.map((d) => d._id)).toEqual(["x"]);
        });

        it("minimal mutation: a below-limit upsert recomputes but leaves the output ref unchanged", async () => {
            postHttpMock.mockResolvedValue({
                docs: [{ _id: "c", type: "content", publishDate: 800, updatedTimeUtc: 4 }],
            });
            const q = track(
                new HybridQuery(
                    {
                        selector: { type: "content" },
                        $sort: [{ publishDate: "desc" as const }],
                        $limit: 2,
                    },
                    { live: true },
                ),
            );
            await flush();
            mocks.liveRefs[0]!.ref.value = [
                { _id: "a", type: "content", publishDate: 3000, updatedTimeUtc: 5 },
            ];
            await flush();
            const ref1 = q.output.value;
            expect(ref1.map((d) => d._id)).toEqual(["a", "c"]); // window full at limit 2

            // publishDate 500 sorts last ⇒ falls beyond the limit-2 window.
            mocks.emitSocket([{ _id: "b", type: "content", publishDate: 500, updatedTimeUtc: 6 }]);
            expect(q.output.value).toBe(ref1); // recompute ran, window identical → same ref
            expect(q.output.value.map((d) => d._id)).toEqual(["a", "c"]);
        });

        it("reconnect re-attaches the listener without re-POSTing; dispose detaches", async () => {
            const q = await setupContentLive();
            expect(mocks.socketDataHandlers.size).toBe(1);
            const postsAfterSetup = postHttpMock.mock.calls.length;

            mocks.isConnected.value = false;
            await flush();
            expect(mocks.socketDataHandlers.size).toBe(0); // detached while offline

            mocks.isConnected.value = true;
            await flush();
            expect(mocks.socketDataHandlers.size).toBe(1); // re-attached, single listener
            expect(postHttpMock.mock.calls.length).toBe(postsAfterSetup); // NOT re-POSTed

            q.dispose();
            expect(mocks.socketDataHandlers.size).toBe(0); // detached on dispose
        });

        it("syncList-only branch attaches no socket listener", async () => {
            mocks.syncList.value = [{ chunkType: "group" }];
            const q = track(new HybridQuery({ selector: { type: "group" } }, { live: true }));
            await flush();
            mocks.liveRefs[0]!.ref.value = [{ _id: "g1", type: "group", updatedTimeUtc: 1 }];
            await flush();

            expect(mocks.socketDataHandlers.size).toBe(0);
            expect(mocks.getSocketMock).not.toHaveBeenCalled();
            expect(q.output.value.map((d) => d._id)).toEqual(["g1"]);
        });

        it("non-synced live type subscribes to its rooms and releases on dispose", async () => {
            // syncList empty → "user" is not synced → non-synced live branch must join the
            // type's rooms on demand (so the server starts pushing) and leave on dispose.
            postHttpMock.mockResolvedValue({ docs: [] });
            const q = track(new HybridQuery({ selector: { type: "user" } }, { live: true }));
            await flush();

            expect(mocks.subscribeRooms).toHaveBeenCalledWith(["user"]);
            const dispose = mocks.subscribeRooms.mock.results[0]!.value as ReturnType<typeof vi.fn>;
            expect(dispose).not.toHaveBeenCalled();

            q.dispose();
            expect(dispose).toHaveBeenCalled();
        });

        it("synced + content live types do NOT drive dynamic room subscriptions", async () => {
            // Synced types (Dexie) and content (rooms joined by sync) must not subscribe.
            mocks.syncList.value = [{ chunkType: "group" }];
            track(new HybridQuery({ selector: { type: "group" } }, { live: true }));
            await flush();
            expect(mocks.subscribeRooms).not.toHaveBeenCalled();
        });
    });

    describe("reactive deps", () => {
        const contentDoc = (id: string, tag: string, publishDate = 500, updatedTimeUtc = 1) => ({
            _id: id,
            type: "content",
            parentTags: [tag],
            publishDate,
            updatedTimeUtc,
        });
        // A reactive content-live query driven by `cats` (a string[] ref). An empty
        // `cats` makes the selector provably-empty (`$elemMatch $in []`).
        const setup = async (cats: { value: string[] }) => {
            postHttpMock.mockResolvedValue({ docs: [] });
            const q = track(
                new HybridQuery(
                    () => ({
                        selector: {
                            $and: [
                                { type: "content" },
                                { parentTags: { $elemMatch: { $in: cats.value } } },
                            ],
                        },
                    }),
                    { live: true },
                ),
            );
            await flush();
            return q;
        };
        // Drive the CURRENT generation's first/next local emission.
        const emitLocal = async (docs: any[]) => {
            mocks.liveRefs[mocks.liveRefs.length - 1]!.ref.value = docs;
            await flush();
        };

        it("rebuilds on dep change: new local subscription + POST selector, socket listener swapped", async () => {
            const cats = ref(["A"]);
            const q = await setup(cats);
            await emitLocal([]); // gen-1 first local ⇒ decides API + attaches socket
            expect(mocks.liveRefs.length).toBe(1);
            expect(postHttpMock).toHaveBeenCalledTimes(1);
            expect(mocks.socketDataHandlers.size).toBe(1);
            expect((postHttpMock.mock.calls[0]![1] as any).selector.$and).toContainEqual({
                parentTags: { $elemMatch: { $in: ["A"] } },
            });

            cats.value = ["B"];
            await flush();
            await emitLocal([]); // gen-2 first local
            expect(mocks.liveRefs.length).toBe(2); // new local subscription
            expect(postHttpMock).toHaveBeenCalledTimes(2); // new POST
            expect(mocks.socketDataHandlers.size).toBe(1); // swapped, not doubled
            expect((postHttpMock.mock.calls[1]![1] as any).selector.$and).toContainEqual({
                parentTags: { $elemMatch: { $in: ["B"] } },
            });

            // socket now filters by the NEW selector.
            mocks.emitSocket([contentDoc("b1", "B", 500, 5)]);
            expect(q.output.value.map((d) => d._id)).toContain("b1");
            mocks.emitSocket([contentDoc("a1", "A", 500, 6)]); // matches only the OLD selector
            expect(q.output.value.map((d) => d._id)).not.toContain("a1");
        });

        it("does not rebuild when the serialized query is unchanged (de-dupe)", async () => {
            const cats = ref(["A"]);
            await setup(cats);
            await emitLocal([]);
            const posts = postHttpMock.mock.calls.length;

            cats.value = ["A"]; // new array identity, same content
            await flush();
            expect(mocks.liveRefs.length).toBe(1); // no rebuild
            expect(postHttpMock.mock.calls.length).toBe(posts);
        });

        it("keeps previous output across a non-empty rebuild until the new query emits", async () => {
            const cats = ref(["A"]);
            const q = await setup(cats);
            await emitLocal([contentDoc("a1", "A", 2000, 5)]);
            expect(q.output.value.map((d) => d._id)).toEqual(["a1"]);

            cats.value = ["B"];
            await flush(); // rebuilt, but gen-2 local not emitted yet
            expect(q.output.value.map((d) => d._id)).toEqual(["a1"]); // KEPT

            await emitLocal([contentDoc("b1", "B", 1500, 7)]);
            expect(q.output.value.map((d) => d._id)).toEqual(["b1"]); // replaced
        });

        it("clears output when the new query is provably-empty, and re-attaches when non-empty again", async () => {
            const cats = ref(["A"]);
            const q = await setup(cats);
            await emitLocal([contentDoc("a1", "A", 2000, 5)]);
            expect(q.output.value.map((d) => d._id)).toEqual(["a1"]);

            cats.value = []; // ⇒ parentTags $elemMatch $in [] ⇒ provably empty
            await flush();
            expect(q.output.value).toEqual([]); // cleared
            expect(mocks.liveRefs.length).toBe(1); // short-circuited: no new local subscription
            expect(mocks.socketDataHandlers.size).toBe(0); // no socket listener

            cats.value = ["C"];
            await flush();
            await emitLocal([contentDoc("c1", "C", 1500, 7)]);
            expect(q.output.value.map((d) => d._id)).toEqual(["c1"]);
            expect(mocks.socketDataHandlers.size).toBe(1); // re-attached
        });

        it("discards an in-flight POST from a superseded generation", async () => {
            const cats = ref(["A"]);
            let resolveA!: (v: any) => void;
            postHttpMock.mockReturnValueOnce(new Promise((res) => (resolveA = res)));
            postHttpMock.mockResolvedValue({ docs: [] });
            const q = track(
                new HybridQuery(
                    () => ({
                        selector: {
                            $and: [
                                { type: "content" },
                                { parentTags: { $elemMatch: { $in: cats.value } } },
                            ],
                        },
                    }),
                    { live: true },
                ),
            );
            await flush();
            await emitLocal([]); // gen-1: POST (pending)

            cats.value = ["B"];
            await flush();
            await emitLocal([]); // gen-2: POST resolves []

            resolveA({ docs: [contentDoc("stale", "A", 500, 9)] }); // gen-1's late POST
            await flush();
            expect(q.output.value.map((d) => d._id)).not.toContain("stale");
        });

        it("tears down the old generation's liveQuery (a stale ref emission is dropped by the stopped effectScope)", async () => {
            const cats = ref(["A"]);
            const q = await setup(cats);
            await emitLocal([contentDoc("a1", "A", 2000, 5)]);
            const gen1Ref = mocks.liveRefs[0]!.ref;

            cats.value = ["B"];
            await flush();
            await emitLocal([contentDoc("b1", "B", 1500, 7)]);
            expect(q.output.value.map((d) => d._id)).toEqual(["b1"]);

            gen1Ref.value = [contentDoc("a2", "A", 2000, 8)]; // drive the OLD generation
            await flush();
            expect(q.output.value.map((d) => d._id)).toEqual(["b1"]); // unchanged
        });

        it("dispose() stops dependency tracking", async () => {
            const cats = ref(["A"]);
            const q = await setup(cats);
            await emitLocal([]);
            const posts = postHttpMock.mock.calls.length;

            q.dispose();
            cats.value = ["B"];
            await flush();
            expect(mocks.liveRefs.length).toBe(1); // no new subscription
            expect(postHttpMock.mock.calls.length).toBe(posts); // no new POST
            expect(mocks.socketDataHandlers.size).toBe(0); // listener removed
        });

        it("one-shot mode + thunk re-queries on dep change (snapshot; no liveQuery/socket)", async () => {
            const cats = ref(["A"]);
            mocks.mangoToDexieMock.mockResolvedValue([]);
            postHttpMock.mockResolvedValue({ docs: [] });
            track(
                new HybridQuery(() => ({
                    selector: {
                        $and: [
                            { type: "content" },
                            { parentTags: { $elemMatch: { $in: cats.value } } },
                        ],
                    },
                })),
            ); // no { live } — reactive, but one-shot reads (no liveQuery/socket)
            await flush();
            expect(mocks.useDexieLiveQueryMock).not.toHaveBeenCalled(); // one-shot read, not liveQuery
            expect(mocks.socketDataHandlers.size).toBe(0); // no socket listener
            const reads = mocks.mangoToDexieMock.mock.calls.length;
            const posts = postHttpMock.mock.calls.length;

            cats.value = ["B"]; // dep change ⇒ re-query, still one-shot
            await flush();
            expect(mocks.mangoToDexieMock.mock.calls.length).toBeGreaterThan(reads); // re-read
            expect(postHttpMock.mock.calls.length).toBeGreaterThan(posts); // re-POST
            expect(mocks.useDexieLiveQueryMock).not.toHaveBeenCalled(); // still no liveQuery
            expect(mocks.socketDataHandlers.size).toBe(0); // still no socket
        });

        it("one-shot de-dupes a no-op (equal-content) dep change", async () => {
            const cats = ref(["A"]);
            mocks.mangoToDexieMock.mockResolvedValue([]);
            postHttpMock.mockResolvedValue({ docs: [] });
            track(
                new HybridQuery(() => ({
                    selector: {
                        $and: [
                            { type: "content" },
                            { parentTags: { $elemMatch: { $in: cats.value } } },
                        ],
                    },
                })),
            );
            await flush();
            const reads = mocks.mangoToDexieMock.mock.calls.length;
            const posts = postHttpMock.mock.calls.length;

            cats.value = ["A"]; // new array identity, same content ⇒ serialized query unchanged
            await flush();
            expect(mocks.mangoToDexieMock.mock.calls.length).toBe(reads); // no re-read
            expect(postHttpMock.mock.calls.length).toBe(posts); // no re-POST
        });

        it("discards a late one-shot local read from a superseded generation (onLocal generation guard)", async () => {
            const cats = ref(["A"]);
            let resolveA!: (v: any) => void;
            mocks.mangoToDexieMock.mockReturnValueOnce(new Promise((res) => (resolveA = res))); // gen-1 read pending
            mocks.mangoToDexieMock.mockResolvedValue([]); // gen-2 read
            postHttpMock.mockResolvedValue({ docs: [] });
            const q = track(
                new HybridQuery(() => ({
                    selector: {
                        $and: [
                            { type: "content" },
                            { parentTags: { $elemMatch: { $in: cats.value } } },
                        ],
                    },
                })), // one-shot: the un-cancellable mangoToDexie().then(onLocal) path
            );
            await flush(); // gen-1 read pending

            cats.value = ["B"];
            await flush(); // gen-2: read resolves [] → output []
            expect(q.output.value).toEqual([]);

            // gen-1's un-cancellable read resolves AFTER the rebuild — the gen guard must drop it.
            resolveA([contentDoc("a-stale", "A", 2000, 9)]);
            await flush();
            expect(q.output.value.map((d) => d._id)).not.toContain("a-stale");
        });

        it("discards a socket batch from a superseded generation (socket cb generation guard)", async () => {
            const cats = ref(["A"]);
            const q = await setup(cats); // live
            await emitLocal([]); // gen-1 attaches the socket listener
            const gen1Cb = Array.from(mocks.socketDataHandlers)[0]!; // gen-1 cb (matchP = $in ["A"])

            cats.value = ["B"];
            await flush();
            await emitLocal([]); // gen-2

            // Invoke the OLD generation's cb directly with a doc matching gen-1's selector,
            // so matchP would accept it — only the generation guard can reject it.
            gen1Cb({ docs: [contentDoc("a-late", "A", 500, 9)] });
            expect(q.output.value.map((d) => d._id)).not.toContain("a-late");
        });

        it("api-only branch rebuilds on dep change (POST + socket, no Dexie read)", async () => {
            const ids = ref(["a"]);
            postHttpMock.mockResolvedValue({ docs: [] });
            track(
                new HybridQuery(
                    () => ({ selector: { type: "redirect", _id: { $in: ids.value } } }),
                    {
                        live: true,
                    },
                ),
            );
            await flush();
            expect(mocks.useDexieLiveQueryMock).not.toHaveBeenCalled(); // api-only: no local read
            expect(mocks.mangoToDexieMock).not.toHaveBeenCalled();
            expect(postHttpMock).toHaveBeenCalledTimes(1);
            expect(mocks.socketDataHandlers.size).toBe(1);
            expect((postHttpMock.mock.calls[0]![1] as any).selector).toEqual({
                type: "redirect",
                _id: { $in: ["a"] },
            });

            ids.value = ["b"];
            await flush();
            expect(postHttpMock).toHaveBeenCalledTimes(2); // re-POST
            expect(mocks.socketDataHandlers.size).toBe(1); // listener swapped, not doubled
            expect((postHttpMock.mock.calls[1]![1] as any).selector).toEqual({
                type: "redirect",
                _id: { $in: ["b"] },
            });
        });

        it("api-only offline rebuild keeps the previous selector's result; the new generation POSTs on reconnect", async () => {
            const ids = ref(["a"]);
            postHttpMock.mockResolvedValue({
                docs: [{ _id: "a1", type: "redirect", updatedTimeUtc: 1 }],
            });
            const q = track(
                new HybridQuery(
                    () => ({ selector: { type: "redirect", _id: { $in: ids.value } } }),
                    {
                        live: true,
                    },
                ),
            );
            await flush();
            expect(q.output.value.map((d) => d._id)).toEqual(["a1"]);

            mocks.isConnected.value = false;
            await flush();
            postHttpMock.mockClear();
            postHttpMock.mockResolvedValue({
                docs: [{ _id: "b1", type: "redirect", updatedTimeUtc: 2 }],
            });

            ids.value = ["b"];
            await flush();
            expect(postHttpMock).not.toHaveBeenCalled(); // offline ⇒ POST deferred
            expect(q.output.value.map((d) => d._id)).toEqual(["a1"]); // kept (prior selector), keep-last-value

            mocks.isConnected.value = true;
            await flush();
            expect(postHttpMock).toHaveBeenCalledTimes(1); // new generation POSTs on reconnect
            expect(q.output.value.map((d) => d._id)).toEqual(["b1"]);
        });

        it("a thunk that throws on its first evaluation throws out of the constructor", () => {
            const bad = ref<string[] | null>(null);
            expect(
                () =>
                    new HybridQuery(
                        () => ({
                            selector: {
                                $and: [
                                    { type: "content" },
                                    { parentTags: { $elemMatch: { $in: bad.value!.slice() } } },
                                ],
                            },
                        }),
                        { live: true },
                    ),
            ).toThrow();
        });

        // Note: a thunk that throws on a LATER evaluation surfaces through Vue's
        // watcher error path (reported to the app error handler), not the
        // constructor — not cleanly assertable in a bare-reactivity harness, so it
        // is documented (README) rather than tested here.
    });

    describe("response caching (cache: true)", () => {
        // A Dexie-only synced type keeps the basic tests focused on the seed path (no
        // POST, no watchers). The seed runs synchronously in the constructor, so an
        // assertion BEFORE flush() observes the seed; after flush() the merged live
        // result. Synced types have no remote contribution, so their cached window is
        // all-local (`remote: []`).
        const syncedQuery = { selector: { type: "group" } };
        beforeEach(() => {
            mocks.syncList.value = [{ chunkType: "group" }];
        });

        it("default (no cache option) never touches the response cache", async () => {
            const local = [{ _id: "g1", updatedTimeUtc: 1, type: "group" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);

            const q = new HybridQuery(syncedQuery);
            await flush();

            expect(q.output.value).toEqual(local);
            expect(localStorage.getItem("hqcache:" + structuralCacheKey(syncedQuery))).toBeNull();
        });

        it("seeds output synchronously from a cache hit, before the local read resolves", () => {
            const g1 = { _id: "g1", updatedTimeUtc: 5, type: "group" };
            writeResponseCache(structuralCacheKey(syncedQuery), { local: [g1], remote: [] });
            // Local read stays pending so only the synchronous seed can have run.
            mocks.mangoToDexieMock.mockReturnValueOnce(new Promise(() => {}));

            const q = new HybridQuery(syncedQuery, { cache: true });

            expect(q.output.value).toEqual([g1]); // painted before any flush
        });

        it("does NOT reassign output when the live result matches the seed (no re-render)", async () => {
            const g1 = { _id: "g1", updatedTimeUtc: 5, type: "group" };
            writeResponseCache(structuralCacheKey(syncedQuery), { local: [g1], remote: [] });
            // Same _id + updatedTimeUtc ⇒ sameWindow ⇒ output kept.
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "g1", updatedTimeUtc: 5, type: "group" },
            ]);

            const q = new HybridQuery(syncedQuery, { cache: true });
            const seededRef = q.output.value;
            await flush();

            expect(q.output.value).toBe(seededRef); // identical array reference
        });

        it("reassigns output when the live result differs from the seed", async () => {
            writeResponseCache(structuralCacheKey(syncedQuery), {
                local: [{ _id: "g1", updatedTimeUtc: 5, type: "group" }],
                remote: [],
            });
            const fresh = [{ _id: "g1", updatedTimeUtc: 6, type: "group" }]; // newer
            mocks.mangoToDexieMock.mockResolvedValueOnce(fresh);

            const q = new HybridQuery(syncedQuery, { cache: true });
            const seededRef = q.output.value;
            await flush();

            expect(q.output.value).not.toBe(seededRef);
            expect(q.output.value).toEqual(fresh);
        });

        it("on a miss, leaves output empty then persists the resolved window split by source", async () => {
            const local = [{ _id: "g1", updatedTimeUtc: 1, type: "group" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);

            const q = new HybridQuery(syncedQuery, { cache: true });
            expect(q.output.value).toEqual([]); // nothing seeded
            await flush();

            expect(q.output.value).toEqual(local);
            // Dexie-only ⇒ everything lands in the local bucket.
            expect(readResponseCache(structuralCacheKey(syncedQuery))).toEqual({
                local,
                remote: [],
            });
        });

        it("shares one entry across queries that differ only in their values", () => {
            const g1 = { _id: "g1", updatedTimeUtc: 5, type: "group" };
            const seedQuery = {
                selector: { $and: [{ type: "group" }, { _id: { $in: ["g1"] } }] },
            };
            const otherQuery = {
                selector: { $and: [{ type: "group" }, { _id: { $in: ["zz", "yy"] } }] },
            };
            writeResponseCache(structuralCacheKey(seedQuery), { local: [g1], remote: [] });
            mocks.mangoToDexieMock.mockReturnValueOnce(new Promise(() => {})); // keep pending

            const q = new HybridQuery(otherQuery, { cache: true });

            expect(q.output.value).toEqual([g1]); // seeded from the shared structural entry
        });

        it("a provably-empty query does not seed (and clears output)", async () => {
            const emptyQuery = {
                selector: {
                    $and: [{ type: "group" }, { parentTags: { $elemMatch: { $in: [] } } }],
                },
            };
            // The populated form shares this structural key; pre-seed under it.
            writeResponseCache(structuralCacheKey(emptyQuery), {
                local: [{ _id: "g1", updatedTimeUtc: 5, type: "group" }],
                remote: [],
            });

            const q = new HybridQuery(emptyQuery, { cache: true });
            expect(q.output.value).toEqual([]); // seed skipped behind the empty guard
            await flush();

            expect(q.output.value).toEqual([]);
            expect(mocks.mangoToDexieMock).not.toHaveBeenCalled();
        });

        describe("content branch (split seed across local + remote)", () => {
            // publishDate desc: L (local, above cutoff) heads the window, R (remote
            // older tail, below cutoff 1000) follows.
            const contentQuery = {
                selector: { type: "content" },
                $sort: [{ publishDate: "desc" as const }],
            };
            const L = { _id: "L1", updatedTimeUtc: 5, publishDate: 2000, type: "content" };
            const R = { _id: "R1", updatedTimeUtc: 3, publishDate: 500, type: "content" };

            it("does NOT collapse to local-only between the Dexie read and the API supplement", async () => {
                writeResponseCache(structuralCacheKey(contentQuery), { local: [L], remote: [R] });
                mocks.mangoToDexieMock.mockResolvedValueOnce([L]); // real local = L
                postHttpMock.mockReturnValueOnce(new Promise(() => {})); // POST never resolves

                const q = track(new HybridQuery(contentQuery, { cache: true }));
                expect(q.output.value.map((d) => d._id)).toEqual(["L1", "R1"]); // seeded

                await flush(); // local lands; POST still pending
                // Crucially still BOTH — the seeded remote bridges the gap, no collapse.
                expect(q.output.value.map((d) => d._id)).toEqual(["L1", "R1"]);
            });

            it("keeps the output reference when local+remote both match the seed", async () => {
                writeResponseCache(structuralCacheKey(contentQuery), { local: [L], remote: [R] });
                mocks.mangoToDexieMock.mockResolvedValueOnce([L]);
                postHttpMock.mockResolvedValueOnce({ docs: [R] });

                const q = track(new HybridQuery(contentQuery, { cache: true }));
                const seededRef = q.output.value;
                await flush();

                expect(q.output.value).toBe(seededRef); // unchanged through both stages
            });

            it("supersedes a seeded older-tail doc the POST no longer returns", async () => {
                // Seed has R (older tail). This session the POST returns R2 instead —
                // R was unpublished. It must NOT linger in the merged window.
                writeResponseCache(structuralCacheKey(contentQuery), { local: [L], remote: [R] });
                mocks.mangoToDexieMock.mockResolvedValueOnce([L]);
                const R2 = { _id: "R2", updatedTimeUtc: 4, publishDate: 600, type: "content" };
                postHttpMock.mockResolvedValueOnce({ docs: [R2] });

                const q = track(new HybridQuery(contentQuery, { cache: true }));
                await flush();

                expect(q.output.value.map((d) => d._id)).toEqual(["L1", "R2"]); // R gone
            });

            it("persists the settled window split by source (local vs older-tail remote)", async () => {
                mocks.mangoToDexieMock.mockResolvedValueOnce([L]); // cache miss
                postHttpMock.mockResolvedValueOnce({ docs: [R] });

                const q = track(new HybridQuery(contentQuery, { cache: true }));
                await flush();

                expect(q.output.value.map((d) => d._id)).toEqual(["L1", "R1"]);
                expect(readResponseCache(structuralCacheKey(contentQuery))).toEqual({
                    local: [L],
                    remote: [R],
                });
            });

            it("strips configured fields from the persisted window but keeps full docs in output", async () => {
                const Lheavy = { ...L, fts: ["aaa:1"], text: "body" };
                const Rheavy = { ...R, fts: ["bbb:1"], text: "body" };
                mocks.mangoToDexieMock.mockResolvedValueOnce([Lheavy]); // cache miss
                postHttpMock.mockResolvedValueOnce({ docs: [Rheavy] });

                const q = track(
                    new HybridQuery(contentQuery, {
                        cache: true,
                        cacheStripFields: ["fts", "text"],
                    }),
                );
                await flush();

                // Stripping only affects what is persisted — output keeps the full docs.
                expect(q.output.value.find((d) => d._id === "L1")).toHaveProperty("text", "body");

                const persisted = readResponseCache(structuralCacheKey(contentQuery))!;
                for (const d of [...persisted.local, ...persisted.remote]) {
                    expect(d).not.toHaveProperty("fts");
                    expect(d).not.toHaveProperty("text");
                }
                expect(persisted.local[0]).toMatchObject({ _id: "L1", publishDate: 2000 });
                expect(persisted.remote[0]).toMatchObject({ _id: "R1", publishDate: 500 });
            });

            it("a stripped seed stays in output when the live read matches (sameWindow holds)", async () => {
                // Seed persisted WITH stripping, as a prior session would have written it.
                writeResponseCache(
                    structuralCacheKey(contentQuery),
                    { local: [L], remote: [R] },
                    undefined,
                    ["text"],
                );
                // The live read returns the FULL docs (text present).
                mocks.mangoToDexieMock.mockResolvedValueOnce([{ ...L, text: "body" }]);
                postHttpMock.mockResolvedValueOnce({ docs: [{ ...R, text: "body" }] });

                const q = track(
                    new HybridQuery(contentQuery, { cache: true, cacheStripFields: ["text"] }),
                );
                const seededRef = q.output.value;
                expect(seededRef.find((d) => d._id === "L1")).not.toHaveProperty("text");
                await flush();

                // id + updatedTimeUtc match ⇒ sameWindow keeps the (stripped) seed array.
                expect(q.output.value).toBe(seededRef);
            });

            it("drops the seeded remote when the local read needs no API (id-list fully local)", async () => {
                const idQuery = {
                    selector: { $and: [{ type: "content" }, { _id: { $in: ["L1"] } }] },
                };
                // Seed carries a stale older-tail doc that the new query won't fetch.
                writeResponseCache(structuralCacheKey(idQuery), { local: [L], remote: [R] });
                mocks.mangoToDexieMock.mockResolvedValueOnce([L]); // requested id present locally

                const q = track(new HybridQuery(idQuery, { cache: true }));
                expect(q.output.value.map((d) => d._id).sort()).toEqual(["L1", "R1"]); // seeded

                await flush(); // all ids local ⇒ no POST ⇒ _dropSeededRemote runs
                expect(postHttpMock).not.toHaveBeenCalled();
                expect(q.output.value.map((d) => d._id)).toEqual(["L1"]); // stale R1 gone
            });

            it("drops the seeded remote under OPEN_MIN (open-ended query, full sync)", async () => {
                // No cutoff: the open-ended content query needs no API, so the stale
                // seeded older-tail doc must not linger — same drop path as id-list.
                mocks.cutoff = OPEN_MIN;
                writeResponseCache(structuralCacheKey(contentQuery), { local: [L], remote: [R] });
                mocks.mangoToDexieMock.mockResolvedValueOnce([L]);

                const q = track(new HybridQuery(contentQuery, { cache: true }));
                expect(q.output.value.map((d) => d._id)).toEqual(["L1", "R1"]); // seeded

                await flush(); // OPEN_MIN ⇒ no POST ⇒ _dropSeededRemote runs
                expect(postHttpMock).not.toHaveBeenCalled();
                expect(q.output.value.map((d) => d._id)).toEqual(["L1"]); // stale R1 gone
            });
        });

        describe("live mode", () => {
            const emit = async (docs: any[]) => {
                mocks.liveRefs[0]!.ref.value = docs;
                await flush();
            };
            const contentQuery = {
                selector: { type: "content" },
                $sort: [{ publishDate: "desc" as const }],
            };
            const L = { _id: "L1", updatedTimeUtc: 5, publishDate: 2000, type: "content" };
            const R = { _id: "R1", updatedTimeUtc: 3, publishDate: 500, type: "content" };

            it("seeds, then a live local emission does not collapse the window before the POST", async () => {
                writeResponseCache(structuralCacheKey(contentQuery), { local: [L], remote: [R] });
                postHttpMock.mockReturnValueOnce(new Promise(() => {})); // POST never resolves

                const q = track(new HybridQuery(contentQuery, { live: true, cache: true }));
                expect(q.output.value.map((d) => d._id)).toEqual(["L1", "R1"]); // synchronous seed

                await emit([L]); // first live emission lands; POST still pending
                expect(q.output.value.map((d) => d._id)).toEqual(["L1", "R1"]); // no collapse
            });

            it("keeps a socket upsert when the POST supersedes the seeded remote", async () => {
                writeResponseCache(structuralCacheKey(contentQuery), { local: [L], remote: [R] });
                let resolvePost!: (v: any) => void;
                postHttpMock.mockReturnValueOnce(
                    new Promise((res) => {
                        resolvePost = res;
                    }),
                );

                const q = track(new HybridQuery(contentQuery, { live: true, cache: true }));
                await emit([L]); // decides API ⇒ POST in flight, socket listener attached

                // A socket upsert (matches the supplement selector) lands before the POST.
                const R2 = { _id: "R2", updatedTimeUtc: 7, publishDate: 400, type: "content" };
                mocks.emitSocket([R2]);
                await flush();
                expect(q.output.value.map((d) => d._id).sort()).toEqual(["L1", "R1", "R2"]);

                // POST resolves; R was unpublished server-side and returns R3 instead.
                const R3 = { _id: "R3", updatedTimeUtc: 8, publishDate: 300, type: "content" };
                resolvePost({ docs: [R3] });
                await flush();

                // Seeded R1 dropped; socket R2 kept; POST R3 added.
                expect(q.output.value.map((d) => d._id).sort()).toEqual(["L1", "R2", "R3"]);
            });
        });

        describe("API-only type", () => {
            const apiQuery = { selector: { type: "redirect" } };

            it("seeds the remote contribution, then the POST supersedes a stale seeded doc", async () => {
                const r1 = { _id: "r1", updatedTimeUtc: 1, type: "redirect" };
                writeResponseCache(structuralCacheKey(apiQuery), { local: [], remote: [r1] });
                const r2 = { _id: "r2", updatedTimeUtc: 2, type: "redirect" };
                postHttpMock.mockResolvedValueOnce({ docs: [r2] });

                const q = track(new HybridQuery(apiQuery, { cache: true }));
                expect(q.output.value.map((d) => d._id)).toEqual(["r1"]); // synchronous seed
                expect(mocks.mangoToDexieMock).not.toHaveBeenCalled(); // no Dexie read

                await flush();
                expect(q.output.value.map((d) => d._id)).toEqual(["r2"]); // POST superseded r1
            });
        });

        describe("reactive thunk", () => {
            it("re-seeds from each generation's own structural entry on a dep change", async () => {
                // Two structurally-DIFFERENT shapes ⇒ two cache entries.
                const unpinnedKey = structuralCacheKey({ selector: { type: "group" } });
                const pinnedKey = structuralCacheKey({
                    selector: { $and: [{ type: "group" }, { parentPinned: 1 }] },
                });
                const g1 = { _id: "g1", updatedTimeUtc: 1, type: "group" };
                const g2 = { _id: "g2", updatedTimeUtc: 2, type: "group" };
                writeResponseCache(unpinnedKey, { local: [g1], remote: [] });
                writeResponseCache(pinnedKey, { local: [g2], remote: [] });
                // Dexie reads stay pending so only the synchronous seed is observable.
                mocks.mangoToDexieMock.mockReturnValue(new Promise(() => {}));

                const pinned = ref(false);
                const q = track(
                    new HybridQuery(
                        () =>
                            pinned.value
                                ? { selector: { $and: [{ type: "group" }, { parentPinned: 1 }] } }
                                : { selector: { type: "group" } },
                        { cache: true },
                    ),
                );
                expect(q.output.value.map((d) => d._id)).toEqual(["g1"]); // gen 1 seed

                pinned.value = true;
                await flush(); // dep change ⇒ rebuild ⇒ gen 2
                expect(q.output.value.map((d) => d._id)).toEqual(["g2"]); // gen 2 seed
            });
        });
    });

    describe("offline persistence (persistOffline)", () => {
        const contentQuery = { selector: { type: "content" } };

        it("persists the syncable subset to IndexedDB and stamps retention", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
            ]);
            postHttpMock.mockResolvedValueOnce({
                docs: [
                    { _id: "old1", updatedTimeUtc: 1, publishDate: 500, type: "content" },
                    { _id: "old2", updatedTimeUtc: 1, publishDate: 400, type: "content" },
                ],
            });

            new HybridQuery(contentQuery, { persistOffline: true });
            await flush();

            expect(mocks.bulkPut).toHaveBeenCalledTimes(1);
            expect(mocks.bulkPut.mock.calls[0][0].map((d: any) => d._id)).toEqual(["old1", "old2"]);
            expect(mocks.touchRetention).toHaveBeenCalledWith(["old1", "old2"]);
        });

        it("drops non-content docs even with the flag (type floor — e.g. CMS user PII)", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([]);
            postHttpMock.mockResolvedValueOnce({
                docs: [
                    { _id: "ok", updatedTimeUtc: 1, publishDate: 500, type: "content" },
                    { _id: "pii", updatedTimeUtc: 1, publishDate: 400, type: "user" },
                ],
            });

            new HybridQuery(contentQuery, { persistOffline: true });
            await flush();

            expect(mocks.bulkPut).toHaveBeenCalledTimes(1);
            expect(mocks.bulkPut.mock.calls[0][0].map((d: any) => d._id)).toEqual(["ok"]);
        });

        it("persists fetched content even when the syncList has no matching entry (below-cutoff-only)", async () => {
            // Regression: with everything below the cutoff, sync fetches nothing → no content
            // syncList entry. persistOffline must still cache the explicitly-fetched content.
            mocks.syncList.value = []; // no entries at all
            mocks.mangoToDexieMock.mockResolvedValueOnce([]);
            postHttpMock.mockResolvedValueOnce({
                docs: [{ _id: "below", updatedTimeUtc: 1, publishDate: 400, type: "content" }],
            });

            new HybridQuery(contentQuery, { persistOffline: true });
            await flush();

            expect(mocks.bulkPut.mock.calls[0][0].map((d: any) => d._id)).toEqual(["below"]);
        });

        it("does not persist when persistOffline is off (default)", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([]);
            postHttpMock.mockResolvedValueOnce({
                docs: [{ _id: "old1", updatedTimeUtc: 1, publishDate: 500, type: "content" }],
            });

            new HybridQuery(contentQuery);
            await flush();

            expect(mocks.bulkPut).not.toHaveBeenCalled();
        });

        it("stamps below-cutoff local docs on recompute for ANY query (not just persistOffline)", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "below", updatedTimeUtc: 1, publishDate: 500, type: "content" },
                { _id: "above", updatedTimeUtc: 2, publishDate: 2000, type: "content" },
            ]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            new HybridQuery(contentQuery);
            await flush();

            const stamped = mocks.touchRetention.mock.calls.flat(2);
            expect(stamped).toContain("below");
            expect(stamped).not.toContain("above");
        });

        it("swallows a bulkPut rejection: no unhandled throw, output correct, retention STILL stamped", async () => {
            const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
            ]);
            postHttpMock.mockResolvedValueOnce({
                docs: [{ _id: "old1", updatedTimeUtc: 1, publishDate: 500, type: "content" }],
            });
            // Persist fails — must not block the synchronous retention stamp or the UI.
            mocks.bulkPut.mockReset();
            mocks.bulkPut.mockRejectedValueOnce(new Error("quota exceeded"));

            const q = new HybridQuery(contentQuery, { persistOffline: true });
            await flush();

            // Output still merges local + remote despite the persist failure.
            expect(q.output.value.map((d) => d._id).sort()).toEqual(["a", "old1"]);
            // Retention is stamped synchronously — the rejected bulkPut promise must
            // not gate it (it is awaited separately, fire-and-forget).
            expect(mocks.touchRetention).toHaveBeenCalledWith(["old1"]);
            // The rejection is logged via the .catch handler, not surfaced.
            expect(errSpy).toHaveBeenCalled();
        });

        it("no content in the supplement: neither bulkPut nor the persist-path retention stamp runs", async () => {
            // Local read returns above-cutoff content (so recompute's UNCONDITIONAL below-cutoff
            // stamp does not fire) and the POST returns only NON-content docs — which the type
            // floor drops — so the whole persist block is skipped.
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
            ]);
            postHttpMock.mockResolvedValueOnce({
                docs: [{ _id: "u1", updatedTimeUtc: 1, type: "user" }],
            });

            new HybridQuery(contentQuery, { persistOffline: true });
            await flush();

            expect(mocks.bulkPut).not.toHaveBeenCalled();
            // No retention stamp at all: the persist path is skipped (no content) and
            // recompute's below-cutoff path has no below-cutoff LOCAL doc.
            expect(mocks.touchRetention).not.toHaveBeenCalled();
        });

        it("composes with the response cache: persists docs AND writes a localStorage cache entry", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "L1", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
            ]);
            const R = { _id: "R1", updatedTimeUtc: 3, publishDate: 500, type: "content" };
            postHttpMock.mockResolvedValueOnce({ docs: [R] });

            const cacheQuery = {
                selector: { type: "content" },
                $sort: [{ publishDate: "desc" as const }],
            };
            const q = track(new HybridQuery(cacheQuery, { persistOffline: true, cache: true }));
            await flush();

            // persistOffline path ran.
            expect(mocks.bulkPut).toHaveBeenCalledTimes(1);
            expect(mocks.bulkPut.mock.calls[0][0].map((d: any) => d._id)).toEqual(["R1"]);
            // cache path ran: a hqcache: entry was written for this query's shape.
            expect(
                localStorage.getItem("hqcache:" + structuralCacheKey(cacheQuery)),
            ).not.toBeNull();
            expect(readResponseCache(structuralCacheKey(cacheQuery))).toEqual({
                local: [{ _id: "L1", updatedTimeUtc: 5, publishDate: 2000, type: "content" }],
                remote: [R],
            });
            expect(q.output.value.map((d) => d._id)).toEqual(["L1", "R1"]);
        });

        it("recompute stamping is gated on cutoff: OPEN_MIN cutoff stamps nothing from recompute", async () => {
            // OPEN_MIN means "no cutoff configured yet" — the whole below-cutoff
            // stamping block in _recompute is skipped. A below-cutoff-LOOKING local
            // doc must NOT be stamped, and (non-persist query) bulkPut never runs.
            mocks.cutoff = OPEN_MIN;
            mocks.syncList.value = [{ chunkType: "group" }]; // Dexie-only ⇒ no POST/persist noise
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "g1", updatedTimeUtc: 1, publishDate: 500, type: "content" },
            ]);

            const q = new HybridQuery({ selector: { type: "group" } });
            await flush();

            expect(q.output.value.map((d) => d._id)).toEqual(["g1"]);
            expect(mocks.touchRetention).not.toHaveBeenCalled();
        });

        it("recompute does NOT stamp non-Content local docs (type !== content / missing publishDate)", async () => {
            // A synced non-content type: even with a real cutoff and a publishDate
            // that is below it, a non-Content doc is not retention-stamped. The
            // doc without a publishDate is likewise skipped.
            mocks.syncList.value = [{ chunkType: "group" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "g1", updatedTimeUtc: 1, publishDate: 500, type: "group" },
                { _id: "g2", updatedTimeUtc: 2, type: "group" }, // no publishDate
            ]);

            const q = new HybridQuery({ selector: { type: "group" } });
            await flush();

            expect(q.output.value.map((d) => d._id)).toEqual(["g1", "g2"]);
            expect(mocks.touchRetention).not.toHaveBeenCalled();
        });

        it("recompute does NOT stamp a Content local doc with no publishDate (pd !== undefined guard)", async () => {
            // Isolates the `pd !== undefined` conjunct for a genuine Content doc (passes
            // the type check, unlike the non-Content case above) so no `< cutoff`
            // comparison is made against undefined.
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "c1", updatedTimeUtc: 1, type: "content" }, // Content, no publishDate
            ]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            new HybridQuery({ selector: { type: "content" } });
            await flush();

            expect(mocks.touchRetention).not.toHaveBeenCalled();
        });

        it("a stale-generation POST does NOT persist (gen guard returns before the persist block)", async () => {
            // Reactive content-live query: the first generation's POST is in flight
            // when a dep change supersedes it. When that stale POST resolves, the
            // gen guard in _postAndMerge returns BEFORE the persist block ⇒ no bulkPut.
            const cats = ref(["A"]);
            let resolveA!: (v: any) => void;
            postHttpMock.mockReturnValueOnce(new Promise((res) => (resolveA = res))); // gen-1 pending
            postHttpMock.mockResolvedValue({ docs: [] }); // gen-2

            const q = track(
                new HybridQuery(
                    () => ({
                        selector: {
                            $and: [
                                { type: "content" },
                                { parentTags: { $elemMatch: { $in: cats.value } } },
                            ],
                        },
                    }),
                    { live: true, persistOffline: true },
                ),
            );
            await flush();
            mocks.liveRefs[mocks.liveRefs.length - 1]!.ref.value = []; // gen-1 first local ⇒ POST in flight
            await flush();

            cats.value = ["B"];
            await flush();
            mocks.liveRefs[mocks.liveRefs.length - 1]!.ref.value = []; // gen-2 first local ⇒ POST resolves []
            await flush();

            // gen-1's late POST resolves with persistable docs — but its generation is dead.
            resolveA({
                docs: [{ _id: "stale", updatedTimeUtc: 9, publishDate: 100, type: "content" }],
            });
            await flush();

            expect(mocks.bulkPut).not.toHaveBeenCalled();
            expect(q.output.value.map((d) => d._id)).not.toContain("stale");
        });

        it("persists the POST result, not socket-seeded / live remote docs", async () => {
            // Live content query: a socket upsert adds a doc to _remote, but persistence
            // only ever writes the one-shot POST's docs (the `remote` arg to _postAndMerge),
            // never the _remote contribution that socket batches mutate.
            const R = { _id: "R1", updatedTimeUtc: 3, publishDate: 500, type: "content" };
            postHttpMock.mockResolvedValue({ docs: [R] });

            const q = track(
                new HybridQuery(
                    { selector: { type: "content" }, $sort: [{ publishDate: "desc" as const }] },
                    { live: true, persistOffline: true },
                ),
            );
            await flush();
            // First live local emission ⇒ API decided, POST runs and persists R1.
            mocks.liveRefs[0]!.ref.value = [
                { _id: "L1", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
            ];
            await flush();
            expect(mocks.bulkPut).toHaveBeenCalledTimes(1);
            expect(mocks.bulkPut.mock.calls[0][0].map((d: any) => d._id)).toEqual(["R1"]);

            // A socket upsert lands — it changes the merged output but must NOT trigger
            // another persist (the persist block lives only in the one-shot _postAndMerge).
            const S = { _id: "S1", updatedTimeUtc: 7, publishDate: 400, type: "content" };
            mocks.emitSocket([S]);
            await flush();

            expect(q.output.value.map((d) => d._id)).toContain("S1");
            expect(mocks.bulkPut).toHaveBeenCalledTimes(1); // still just the POST persist
            // The single persisted batch is exactly the POST docs, never S1.
            expect(mocks.bulkPut.mock.calls[0][0].map((d: any) => d._id)).not.toContain("S1");
        });
    });

    describe("field stripping (stripFields)", () => {
        const contentQuery = { selector: { type: "content" } };

        it("omits stripFields from the local and remote contributions in output", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                {
                    _id: "a",
                    updatedTimeUtc: 5,
                    publishDate: 2000,
                    type: "content",
                    text: "body-a",
                    fts: ["x:1"],
                },
            ]);
            postHttpMock.mockResolvedValueOnce({
                docs: [
                    {
                        _id: "old1",
                        updatedTimeUtc: 1,
                        publishDate: 500,
                        type: "content",
                        text: "body-old",
                        fts: ["y:1"],
                    },
                ],
            });

            const q = new HybridQuery(contentQuery, { stripFields: ["text", "fts"] });
            await flush();

            const out = q.output.value as any[];
            expect(out.map((d) => d._id).sort()).toEqual(["a", "old1"]);
            for (const d of out) {
                expect(d).not.toHaveProperty("text");
                expect(d).not.toHaveProperty("fts");
                // Untouched fields survive; merge/sort/dedup keys are never stripped.
                expect(d._id).toBeDefined();
                expect(d.updatedTimeUtc).toBeDefined();
            }
        });

        it("persistOffline writes the FULL doc even when those fields are stripped from output", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
            ]);
            postHttpMock.mockResolvedValueOnce({
                docs: [
                    {
                        _id: "old1",
                        updatedTimeUtc: 1,
                        publishDate: 500,
                        type: "content",
                        text: "FULL",
                        fts: ["t:1"],
                    },
                ],
            });

            const q = new HybridQuery(contentQuery, {
                stripFields: ["text", "fts"],
                persistOffline: true,
            });
            await flush();

            // Output is stripped...
            const remoteOut = (q.output.value as any[]).find((d) => d._id === "old1");
            expect(remoteOut).not.toHaveProperty("text");
            // ...but the offline-persisted doc keeps every field.
            expect(mocks.bulkPut).toHaveBeenCalledTimes(1);
            const persisted = mocks.bulkPut.mock.calls[0][0][0];
            expect(persisted._id).toBe("old1");
            expect(persisted.text).toBe("FULL");
            expect(persisted.fts).toEqual(["t:1"]);
        });

        it("strips socket upserts before they enter the remote contribution", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            const q = track(
                new HybridQuery(
                    { selector: { type: "content" }, $sort: [{ publishDate: "desc" as const }] },
                    { live: true, stripFields: ["text"] },
                ),
            );
            await flush();
            // Drive the first local emission so the API supplement is decided.
            mocks.liveRefs[0]!.ref.value = [];
            await flush();

            mocks.emitSocket([
                {
                    _id: "S1",
                    updatedTimeUtc: 7,
                    publishDate: 400,
                    type: "content",
                    text: "socket-body",
                },
            ]);
            await flush();

            const s1 = (q.output.value as any[]).find((d) => d._id === "S1");
            expect(s1).toBeDefined();
            expect(s1).not.toHaveProperty("text");
        });

        it("default (no stripFields) leaves docs untouched", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content", text: "keep" },
            ]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            const q = new HybridQuery(contentQuery);
            await flush();

            expect((q.output.value as any[])[0]).toHaveProperty("text", "keep");
        });
    });

    describe("isFetching / error", () => {
        it("content one-shot: isFetching true (output empty) before flush, false after local + POST settle", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
            ]);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            const q = new HybridQuery({ selector: { type: "content" } });
            // Still fetching, and output is empty — the distinction the feature exists for.
            expect(q.isFetching.value).toBe(true);
            expect(q.output.value).toEqual([]);

            await flush();
            expect(q.isFetching.value).toBe(false);
            expect(q.error.value).toBeUndefined();
        });

        it("content: local fully satisfies (no POST) ⇒ settles on the local read alone", async () => {
            const local = Array.from({ length: 10 }, (_, i) => ({
                _id: String(i),
                updatedTimeUtc: i,
                publishDate: 2000 + i,
                type: "content",
            }));
            mocks.mangoToDexieMock.mockResolvedValueOnce(local);

            const q = new HybridQuery({ selector: { type: "content" }, $limit: 10 });
            await flush();

            expect(postHttpMock).not.toHaveBeenCalled();
            expect(q.isFetching.value).toBe(false);
        });

        it("content: isFetching stays true until the supplement POST settles (covers the remote leg)", async () => {
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
            ]);
            let resolvePost!: (v: any) => void;
            postHttpMock.mockReturnValueOnce(new Promise((res) => (resolvePost = res)));

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();
            // Local has settled and data is painted, but the supplement is still in flight.
            expect(q.output.value.map((d) => d._id)).toEqual(["a"]);
            expect(q.isFetching.value).toBe(true);

            resolvePost({ docs: [] });
            await flush();
            expect(q.isFetching.value).toBe(false);
        });

        it("synced type: settles false on the first local emission, no POST", async () => {
            mocks.syncList.value = [{ chunkType: "group" }];
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "g1", updatedTimeUtc: 1, type: "group" },
            ]);

            const q = new HybridQuery({ selector: { type: "group" } });
            expect(q.isFetching.value).toBe(true);

            await flush();
            expect(postHttpMock).not.toHaveBeenCalled();
            expect(q.isFetching.value).toBe(false);
        });

        it("api-only offline: settles false (parked), and the reconnect POST does not re-enter loading", async () => {
            mocks.isConnected.value = false;
            postHttpMock.mockResolvedValueOnce({
                docs: [{ _id: "r1", updatedTimeUtc: 1, type: "redirect" }],
            });

            const q = track(new HybridQuery({ selector: { type: "redirect" } }));
            await flush();
            expect(postHttpMock).not.toHaveBeenCalled();
            expect(q.isFetching.value).toBe(false); // parked on the reconnect watcher, not fetching

            mocks.isConnected.value = true;
            await flush();
            expect(postHttpMock).toHaveBeenCalledTimes(1);
            expect(q.isFetching.value).toBe(false); // background supplement does NOT re-toggle loading
        });

        it("api-only online: isFetching true until the POST resolves", async () => {
            let resolvePost!: (v: any) => void;
            postHttpMock.mockReturnValueOnce(new Promise((res) => (resolvePost = res)));

            const q = new HybridQuery({ selector: { type: "redirect" } });
            await flush();
            expect(q.isFetching.value).toBe(true);

            resolvePost({ docs: [] });
            await flush();
            expect(q.isFetching.value).toBe(false);
        });

        it("rebuild (dep change) re-enters loading until the new generation settles", async () => {
            const cats = ref(["A"]);
            mocks.mangoToDexieMock.mockResolvedValueOnce([]); // gen-1 local
            postHttpMock.mockResolvedValue({ docs: [] });
            const q = track(
                new HybridQuery(() => ({
                    selector: {
                        $and: [
                            { type: "content" },
                            { parentTags: { $elemMatch: { $in: cats.value } } },
                        ],
                    },
                })),
            );
            await flush();
            expect(q.isFetching.value).toBe(false);

            // Defer the gen-2 local read so the re-entered loading window is observable.
            let resolveLocal!: (v: any) => void;
            mocks.mangoToDexieMock.mockReturnValueOnce(new Promise((res) => (resolveLocal = res)));
            cats.value = ["B"];
            await flush(); // watcher fires _rebuild ⇒ loading re-entered; gen-2 local pending
            expect(q.isFetching.value).toBe(true);

            resolveLocal([]);
            await flush();
            expect(q.isFetching.value).toBe(false);
        });

        it("provably-empty selector settles isFetching false and leaves error undefined", async () => {
            const q = track(
                new HybridQuery(
                    {
                        selector: {
                            $and: [
                                { type: "content" },
                                { parentTags: { $elemMatch: { $in: [] } } },
                            ],
                        },
                    },
                    { live: true },
                ),
            );
            await flush();
            expect(q.isFetching.value).toBe(false);
            expect(q.error.value).toBeUndefined();
        });

        it("error is set on a total remote failure; output preserved; isFetching settles false", async () => {
            const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            mocks.mangoToDexieMock.mockResolvedValueOnce([
                { _id: "L", updatedTimeUtc: 9, publishDate: 2000, type: "content" },
            ]);
            const boom = new Error("boom");
            postHttpMock.mockRejectedValueOnce(boom);

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();

            expect(q.error.value).toBe(boom);
            expect(q.output.value.map((d) => d._id)).toEqual(["L"]); // local preserved, heals later
            expect(q.isFetching.value).toBe(false);
            errSpy.mockRestore();
        });

        it("a partial fan-out failure does NOT set error (some results returned)", async () => {
            const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            mocks.mangoToDexieMock.mockResolvedValueOnce([]);
            postHttpMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({
                docs: [
                    {
                        _id: "c2",
                        updatedTimeUtc: 2,
                        publishDate: 200,
                        type: "content",
                        parentId: "p2",
                    },
                ],
            });

            const q = new HybridQuery({
                selector: { $and: [{ type: "content" }, { parentId: { $in: ["p1", "p2"] } }] },
                $sort: [{ publishDate: "desc" as const }],
            });
            await flush();

            expect(q.error.value).toBeUndefined(); // partial success ⇒ no error surfaced
            expect(q.output.value.map((d) => d._id)).toEqual(["c2"]);
            expect(q.isFetching.value).toBe(false);
            errSpy.mockRestore();
        });

        it("error is cleared on rebuild", async () => {
            const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            const cats = ref(["A"]);
            mocks.mangoToDexieMock.mockResolvedValue([
                {
                    _id: "a",
                    type: "content",
                    parentTags: ["A"],
                    publishDate: 2000,
                    updatedTimeUtc: 1,
                },
            ]);
            const boom = new Error("boom");
            postHttpMock.mockRejectedValueOnce(boom);
            postHttpMock.mockResolvedValue({ docs: [] });
            const q = track(
                new HybridQuery(() => ({
                    selector: {
                        $and: [
                            { type: "content" },
                            { parentTags: { $elemMatch: { $in: cats.value } } },
                        ],
                    },
                })),
            );
            await flush();
            expect(q.error.value).toBe(boom);

            cats.value = ["B"];
            await flush();
            expect(q.error.value).toBeUndefined();
            errSpy.mockRestore();
        });

        it("local read failure: sets error, still settles, content branch still decides the API", async () => {
            const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            const boom = new Error("dexie boom");
            mocks.mangoToDexieMock.mockRejectedValueOnce(boom);
            postHttpMock.mockResolvedValueOnce({ docs: [] });

            const q = new HybridQuery({ selector: { type: "content" } });
            await flush();

            expect(q.error.value).toBe(boom);
            expect(postHttpMock).toHaveBeenCalledTimes(1); // decided the API off the empty local set
            expect(q.isFetching.value).toBe(false);
            errSpy.mockRestore();
        });

        it("a superseded generation's late POST does not clear the new generation's isFetching", async () => {
            const cats = ref(["A"]);
            mocks.mangoToDexieMock.mockResolvedValue([
                {
                    _id: "a",
                    type: "content",
                    parentTags: ["A"],
                    publishDate: 2000,
                    updatedTimeUtc: 1,
                },
            ]);
            let resolveA!: (v: any) => void;
            let resolveB!: (v: any) => void;
            postHttpMock
                .mockReturnValueOnce(new Promise((res) => (resolveA = res))) // gen-1 POST pending
                .mockReturnValueOnce(new Promise((res) => (resolveB = res))); // gen-2 POST pending
            const q = track(
                new HybridQuery(() => ({
                    selector: {
                        $and: [
                            { type: "content" },
                            { parentTags: { $elemMatch: { $in: cats.value } } },
                        ],
                    },
                })),
            );
            await flush();
            expect(q.isFetching.value).toBe(true); // gen-1 remote pending

            cats.value = ["B"];
            await flush();
            expect(q.isFetching.value).toBe(true); // gen-2 remote pending

            // gen-1's late POST resolves AFTER the rebuild — its settle must be a no-op.
            resolveA({ docs: [] });
            await flush();
            expect(q.isFetching.value).toBe(true); // still loading on gen-2

            resolveB({ docs: [] });
            await flush();
            expect(q.isFetching.value).toBe(false);
        });
    });
});

describe("queryRemote", () => {
    let postHttpMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        _resetHybridQueryForTests();
        postHttpMock = vi.fn();
        mocks.config.cms = false;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("throws if initHybridQuery has not been called", async () => {
        await expect(queryRemote({ selector: { type: "post" } })).rejects.toThrow(
            /not initialized with HTTP service/,
        );
    });

    it("POSTs selector + identifier=hybridQuery + default limit when no $limit", async () => {
        postHttpMock.mockResolvedValueOnce({ docs: [{ _id: "x" }] });
        initHybridQuery({ post: postHttpMock } as any);

        const docs = await queryRemote({ selector: { type: "post" } });

        expect(postHttpMock).toHaveBeenCalledWith("query", {
            selector: { type: "post" },
            identifier: "hybridQuery",
            limit: DEFAULT_REMOTE_QUERY_LIMIT,
        });
        expect(docs).toEqual([{ _id: "x" }]);
    });

    it("forwards explicit $limit and $sort to the wire payload", async () => {
        postHttpMock.mockResolvedValueOnce({ docs: [] });
        initHybridQuery({ post: postHttpMock } as any);

        await queryRemote({
            selector: { type: "post" },
            $limit: 25,
            $sort: [{ updatedTimeUtc: "desc" as const }],
        });

        expect(postHttpMock).toHaveBeenCalledWith("query", {
            selector: { type: "post" },
            identifier: "hybridQuery",
            limit: 25,
            sort: [{ updatedTimeUtc: "desc" }],
        });
    });

    it("returns an empty array when the API response omits docs", async () => {
        postHttpMock.mockResolvedValueOnce({});
        initHybridQuery({ post: postHttpMock } as any);

        const docs = await queryRemote({ selector: { type: "post" } });
        expect(docs).toEqual([]);
    });

    it("forwards cms:true onto the wire payload when config.cms is true", async () => {
        postHttpMock.mockResolvedValueOnce({ docs: [] });
        initHybridQuery({ post: postHttpMock } as any);
        mocks.config.cms = true;

        await queryRemote({ selector: { type: "post" } });

        expect(postHttpMock).toHaveBeenCalledWith("query", {
            selector: { type: "post" },
            identifier: "hybridQuery",
            limit: DEFAULT_REMOTE_QUERY_LIMIT,
            cms: true,
        });
    });

    it("omits cms from the wire payload when config.cms is false (non-CMS consumers unaffected)", async () => {
        postHttpMock.mockResolvedValueOnce({ docs: [] });
        initHybridQuery({ post: postHttpMock } as any);
        mocks.config.cms = false;

        await queryRemote({ selector: { type: "post" } });

        const payload = postHttpMock.mock.calls[0][1];
        expect(payload).not.toHaveProperty("cms");
    });
});
