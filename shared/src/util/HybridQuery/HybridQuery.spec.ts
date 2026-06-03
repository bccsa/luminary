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
        isConnected: ref(true) as { value: boolean },
        syncList: { value: [] as Array<{ chunkType: string }> },
        cutoff: 1000,
        liveRefs,
        useDexieLiveQueryMock: vi.fn((querier: any, options: any) => {
            const r = shallowRef(options?.initialValue);
            liveRefs.push({ ref: r, querier, options });
            return r;
        }),
        validateDeleteCommandMock: vi.fn(() => true),
        socketDataHandlers,
        getSocketMock: vi.fn(() => socketMock),
        emitSocket: (docs: any[]) => {
            for (const h of [...socketDataHandlers]) h({ docs });
        },
    };
});

vi.mock("../../socket/socketio", () => ({
    isConnected: mocks.isConnected,
    getSocket: mocks.getSocketMock,
}));

vi.mock("../MangoQuery/mangoToDexie", () => ({
    mangoToDexie: mocks.mangoToDexieMock,
}));

vi.mock("../../db/database", () => ({
    db: { docs: mocks.docsTable, validateDeleteCommand: mocks.validateDeleteCommandMock },
}));

vi.mock("../../rest/sync2/state", () => ({
    syncList: mocks.syncList,
}));

vi.mock("../../config", () => ({
    // Read mocks.cutoff at call time so tests can change it per case.
    getContentPublishDateCutoff: () => mocks.cutoff,
    config: {},
    initConfig: () => {},
}));

// Live mode only. One-shot tests never call useDexieLiveQuery, so this mock is
// inert for them.
vi.mock("../useDexieLiveQuery/useDexieLiveQuery", () => ({
    useDexieLiveQuery: mocks.useDexieLiveQueryMock,
}));

import { effectScope, nextTick } from "vue";
import { DocType } from "../../types";

import {
    _resetHybridQueryForTests,
    DEFAULT_REMOTE_QUERY_LIMIT,
    HybridQuery,
    initHybridQuery,
    postQuery,
} from "./HybridQuery";

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
        _resetHybridQueryForTests();
        mocks.mangoToDexieMock.mockReset();
        mocks.isConnected.value = true;
        mocks.syncList.value = [];
        mocks.cutoff = 1000;
        mocks.useDexieLiveQueryMock.mockClear();
        mocks.liveRefs.length = 0;
        mocks.validateDeleteCommandMock.mockReset();
        mocks.validateDeleteCommandMock.mockReturnValue(true);
        mocks.getSocketMock.mockClear();
        mocks.socketDataHandlers.clear();
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

    describe("content routing", () => {
        it("no $limit + no _id list ⇒ always POSTs with publishDate <= cutoff", async () => {
            const local = [
                { _id: "a", updatedTimeUtc: 5, publishDate: 2000, type: "content" },
            ];
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
            // POST is pending. dispose() before postQuery resolves must prevent
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
            const local = [
                { _id: "fresh", updatedTimeUtc: 9, publishDate: 5000, type: "content" },
            ];
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
            const local = [
                { _id: "a", updatedTimeUtc: 5, publishDate: 30, type: "content" },
            ];
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
            ["always-post (no limit, no id list)", () => new HybridQuery({ selector: { type: "content" } })],
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
        ])(
            "uses getContentPublishDateCutoff() verbatim — %s",
            async (_label, build) => {
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
            },
        );
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
                { selector: { type: "content" }, $sort: [{ publishDate: "desc" as const }], $limit: 1 },
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
            query: any = { selector: { type: "content" }, $sort: [{ publishDate: "desc" as const }] },
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
    });
});

describe("postQuery", () => {
    let postHttpMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        _resetHybridQueryForTests();
        postHttpMock = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("throws if initHybridQuery has not been called", async () => {
        await expect(postQuery({ selector: { type: "post" } })).rejects.toThrow(
            /not initialized with HTTP service/,
        );
    });

    it("POSTs selector + identifier=hybridQuery + default limit when no $limit", async () => {
        postHttpMock.mockResolvedValueOnce({ docs: [{ _id: "x" }] });
        initHybridQuery({ post: postHttpMock } as any);

        const docs = await postQuery({ selector: { type: "post" } });

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

        await postQuery({
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

        const docs = await postQuery({ selector: { type: "post" } });
        expect(docs).toEqual([]);
    });
});
