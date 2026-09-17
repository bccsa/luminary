/**
 * QuerySession: execution lifetime, slice extension and the activity signal a
 * paged consumer reads. Exercises only the public surface (QuerySession +
 * QueryCapabilities), so a change that quietly breaks appending fails here
 * rather than in a consumer.
 */
import { describe, expect, it, vi } from "vitest";
import type { BaseDocumentDto } from "../../types";
import type { LocalRead, QueryCapabilities, QueryPlan } from "./contracts";
import { planBrowserQuery } from "./browserPlanner";
import { paginateByLimit } from "./pagination";
import type { HybridQueryOptions } from "./options";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import { QuerySession } from "./querySession";
import { mangoCompile } from "../MangoQuery/mangoCompile";

const doc = (id: string, publishDate: number, time = 1) =>
    ({ _id: id, updatedTimeUtc: time, type: "content", publishDate }) as BaseDocumentDto;

const page1 = {
    selector: { type: "content" },
    $sort: [{ publishDate: "desc" }],
    $limit: 2,
} as MangoQuery;

const covered = (docs: BaseDocumentDto[]): LocalRead<BaseDocumentDto> => ({
    docs,
    covered: true,
});

async function flush() {
    for (let i = 0; i < 8; i++) await Promise.resolve();
}

function harness(options: HybridQueryOptions = {}, paged = true) {
    const publish = vi.fn();
    const pending = vi.fn();
    const error = vi.fn();
    const localStops: Array<ReturnType<typeof vi.fn>> = [];
    const socketStops: Array<ReturnType<typeof vi.fn>> = [];
    const emissions: Array<(docs: BaseDocumentDto[]) => void> = [];
    const capabilities: QueryCapabilities<BaseDocumentDto> = {
        plan: (query) => planBrowserQuery(query, capabilities.coverage!),
        pagination: paged ? paginateByLimit(2) : undefined,
        sources: {
            readLocal: vi.fn().mockResolvedValue(covered([])),
            readRemote: vi.fn().mockResolvedValue([]),
            observeLocal: vi.fn((_q, value, _e, own) => {
                emissions.push(value);
                const stop = vi.fn();
                localStops.push(stop);
                own(stop);
            }),
            observeRemote: vi.fn((_q, _t, _c, own) => {
                const stop = vi.fn();
                socketStops.push(stop);
                own(stop);
            }),
            connected: () => true,
            watchConnection: vi.fn(() => vi.fn()),
            joinRooms: vi.fn(() => vi.fn()),
            validateDelete: () => true,
        },
        coverage: {
            cutoff: () => 1000,
            isSynced: () => false,
            watchMembership: vi.fn(() => vi.fn()),
        },
        persistence: { touchLocal: vi.fn() },
    };
    const session = new QuerySession(() => page1, options, capabilities, {
        publish,
        pending,
        error,
    });
    return { session, capabilities, publish, pending, error, localStops, socketStops, emissions };
}

const lastActivity = (pending: ReturnType<typeof vi.fn>) =>
    pending.mock.calls[pending.mock.calls.length - 1][0];

describe("QuerySession.extend(): appending without a rebuild", () => {
    it("keeps the earlier slice's remote docs instead of restarting from empty", async () => {
        const h = harness();
        vi.mocked(h.capabilities.sources.readLocal).mockResolvedValue(covered([doc("a", 3000)]));
        vi.mocked(h.capabilities.sources.readRemote).mockResolvedValue([doc("r1", 900)]);
        h.session.rebuild(page1);
        await flush();
        expect(h.publish).toHaveBeenLastCalledWith([doc("a", 3000), doc("r1", 900)]);

        vi.mocked(h.capabilities.sources.readLocal).mockResolvedValue(
            covered([doc("a", 3000), doc("b", 2000)]),
        );
        vi.mocked(h.capabilities.sources.readRemote).mockResolvedValue([doc("r2", 800)]);
        h.session.extend();
        await flush();

        // r1 came from the FIRST slice and was never re-fetched, yet it is still here.
        expect(h.publish).toHaveBeenLastCalledWith([
            doc("a", 3000),
            doc("b", 2000),
            doc("r1", 900),
            doc("r2", 800),
        ]);
    });

    it("replaces the local subscription but leaves the socket listener and rooms standing", async () => {
        const h = harness({ live: true });
        vi.mocked(h.capabilities.sources.readRemote).mockResolvedValue([doc("r1", 900)]);
        h.session.rebuild(page1);
        h.emissions[0]([doc("a", 3000)]);
        await flush();
        expect(h.localStops).toHaveLength(1);
        expect(h.socketStops).toHaveLength(1);

        h.session.extend();
        h.emissions[1]([doc("a", 3000), doc("b", 2000)]);
        await flush();

        // The Dexie subscription is query-bound, so the wider slice re-subscribes…
        expect(h.localStops[0]).toHaveBeenCalledTimes(1);
        expect(h.localStops).toHaveLength(2);
        // …while the socket listener and its rooms span the generation untouched.
        expect(h.socketStops[0]).not.toHaveBeenCalled();
        expect(h.socketStops).toHaveLength(1);
        expect(h.capabilities.sources.observeRemote).toHaveBeenCalledTimes(1);
    });

    it("starts the live subscription on the slice that first needs a remote call, not only the first", async () => {
        const h = harness({ live: true });
        // First slice is fully covered locally — no remote call, so no live subscription yet.
        vi.mocked(h.capabilities.sources.readLocal).mockResolvedValue(
            covered([doc("a", 3000), doc("b", 2000)]),
        );
        h.session.rebuild(page1);
        h.emissions[0]([doc("a", 3000), doc("b", 2000)]);
        await flush();
        expect(h.capabilities.sources.observeRemote).not.toHaveBeenCalled();

        // The second slice needs the API supplement to fill the wider window — the live
        // subscription must start here instead of never starting at all. It returns
        // enough rows to fill the $limit:4 window so a further slice remains reachable.
        vi.mocked(h.capabilities.sources.readRemote).mockResolvedValue([
            doc("r1", 900),
            doc("r2", 800),
        ]);
        h.session.extend();
        h.emissions[1]([doc("a", 3000), doc("b", 2000)]);
        await flush();
        expect(h.capabilities.sources.observeRemote).toHaveBeenCalledTimes(1);

        // A further slice must not start a second, redundant subscription.
        vi.mocked(h.capabilities.sources.readRemote).mockResolvedValue([doc("r3", 700)]);
        h.session.extend();
        h.emissions[2]([doc("a", 3000), doc("b", 2000)]);
        await flush();
        expect(h.capabilities.sources.observeRemote).toHaveBeenCalledTimes(1);
    });

    it("re-decides the API supplement per slice rather than once per generation", async () => {
        const h = harness();
        vi.mocked(h.capabilities.sources.readLocal).mockResolvedValue(covered([doc("a", 3000)]));
        vi.mocked(h.capabilities.sources.readRemote).mockResolvedValue([doc("r1", 900)]);
        h.session.rebuild(page1);
        await flush();
        expect(h.capabilities.sources.readRemote).toHaveBeenCalledTimes(1);

        h.session.extend();
        await flush();
        expect(h.capabilities.sources.readRemote).toHaveBeenCalledTimes(2);
    });

    it("ignores an extend while a slice is still in flight", async () => {
        const h = harness();
        vi.mocked(h.capabilities.sources.readLocal).mockReturnValue(new Promise(() => {}));
        h.session.rebuild(page1);
        h.session.extend();
        await flush();
        expect(h.capabilities.sources.readLocal).toHaveBeenCalledTimes(1);
    });

    it("is inert without a pagination capability", async () => {
        const h = harness({}, /* paged */ false);
        vi.mocked(h.capabilities.sources.readLocal).mockResolvedValue(
            covered([doc("a", 3000), doc("b", 2000)]),
        );
        h.session.rebuild(page1);
        await flush();
        expect(lastActivity(h.pending).more).toBe(false);

        h.session.extend();
        await flush();
        expect(h.capabilities.sources.readLocal).toHaveBeenCalledTimes(1);
    });

    it("retries the same slice, and reports it as still extendable, after a page fetch fails outright", async () => {
        const h = harness();
        vi.mocked(h.capabilities.sources.readLocal).mockResolvedValue(
            covered([doc("a", 3000), doc("b", 2000)]),
        );
        h.session.rebuild(page1);
        await flush();

        vi.mocked(h.capabilities.sources.readLocal).mockResolvedValue(
            covered([doc("a", 3000), doc("b", 2000)]),
        );
        vi.mocked(h.capabilities.sources.readRemote).mockRejectedValueOnce(new Error("HTTP 500"));
        h.session.extend();
        await flush();

        // The window under-filled because the fetch failed, not because the source is
        // exhausted — `more` must stay true so a consumer's retry affordance survives.
        expect(lastActivity(h.pending).more).toBe(true);
        expect(h.error).toHaveBeenCalled();

        vi.mocked(h.capabilities.sources.readRemote).mockResolvedValue([doc("r1", 900)]);
        h.session.extend();
        await flush();

        // The retry re-ran the SAME slice (limit unchanged at 4), not a further-advanced one.
        const secondCall = vi.mocked(h.capabilities.sources.readRemote).mock.calls[1][0];
        expect(secondCall.$limit).toBe(2);
        expect(h.publish).toHaveBeenLastCalledWith([
            doc("a", 3000),
            doc("b", 2000),
            doc("r1", 900),
        ]);
    });
});

describe("QuerySession: the activity signal a paged consumer needs", () => {
    it("distinguishes an initial load from an append", async () => {
        const h = harness();
        vi.mocked(h.capabilities.sources.readLocal).mockResolvedValue(
            covered([doc("a", 3000), doc("b", 2000)]),
        );
        h.session.rebuild(page1);
        await flush();
        expect(lastActivity(h.pending).kind).toBe("initial");

        h.session.extend();
        expect(lastActivity(h.pending)).toMatchObject({ kind: "extend", local: true });
        await flush();
        expect(lastActivity(h.pending).kind).toBe("extend");
    });

    it("reports `more` from a settled window: full page yes, short page no", async () => {
        const full = harness();
        vi.mocked(full.capabilities.sources.readLocal).mockResolvedValue(
            covered([doc("a", 3000), doc("b", 2000)]),
        );
        full.session.rebuild(page1);
        await flush();
        expect(lastActivity(full.pending).more).toBe(true);

        const short = harness();
        vi.mocked(short.capabilities.sources.readLocal).mockResolvedValue(
            covered([doc("a", 3000)]),
        );
        short.session.rebuild(page1);
        await flush();
        expect(lastActivity(short.pending).more).toBe(false);
    });
});

describe("QuerySession: can a plan narrow past what the window already holds?", () => {
    it("hands the accumulated remote contribution to the next slice's plan", async () => {
        const seen: Array<readonly BaseDocumentDto[]> = [];
        const capabilities: QueryCapabilities<BaseDocumentDto> = {
            plan: (query): QueryPlan<BaseDocumentDto> => ({
                useLocal: true,
                remote: (_local, _covered, held) => {
                    seen.push(held);
                    return query;
                },
            }),
            pagination: paginateByLimit(2),
            sources: {
                readLocal: vi.fn().mockResolvedValue(covered([doc("a", 3000), doc("b", 2000)])),
                readRemote: vi.fn().mockResolvedValue([doc("r1", 900)]),
            },
        };
        const session = new QuerySession(() => page1, {}, capabilities, {
            publish: vi.fn(),
            pending: vi.fn(),
            error: vi.fn(),
        });
        session.rebuild(page1);
        await flush();
        session.extend();
        await flush();

        expect(seen[0]).toEqual([]);
        expect(seen[1]).toEqual([doc("r1", 900)]);
    });

    it("does not count a response-cache seed as already fetched", async () => {
        const capabilities: QueryCapabilities<BaseDocumentDto> = {
            plan: (query) => planBrowserQuery(query, capabilities.coverage!),
            sources: {
                readLocal: vi.fn().mockResolvedValue(covered([doc("a", 3000)])),
                readRemote: vi.fn().mockResolvedValue([doc("fresh", 900)]),
            },
            coverage: {
                cutoff: () => 1000,
                isSynced: () => false,
                watchMembership: vi.fn(() => vi.fn()),
            },
            cache: {
                key: () => "k",
                // A seeded full page: one local doc plus one remote doc, against $limit 2.
                read: () => ({ local: [doc("a", 3000)], remote: [doc("stale", 800)] }) as any,
                write: vi.fn(),
            },
        };
        const session = new QuerySession(() => page1, {}, capabilities, {
            publish: vi.fn(),
            pending: vi.fn(),
            error: vi.fn(),
        });
        session.rebuild(page1);
        await flush();

        // The seed is a stale first paint, not a fetch. Counting it as held would fill
        // the window on paper and suppress the very supplement that supersedes it.
        expect(capabilities.sources.readRemote).toHaveBeenCalledTimes(1);
    });

    it("does not let a live socket upsert anchor the keyset boundary for the next slice", async () => {
        const seen: Array<readonly BaseDocumentDto[]> = [];
        let socketPush: ((data: any, matches: any, matchesDelete: any) => void) | undefined;
        const matchesAll = () => true;
        const capabilities: QueryCapabilities<BaseDocumentDto> = {
            plan: (query): QueryPlan<BaseDocumentDto> => ({
                useLocal: false,
                remote: (_local, _covered, held) => {
                    seen.push(held);
                    return query;
                },
            }),
            pagination: paginateByLimit(2),
            sources: {
                readLocal: vi.fn().mockResolvedValue(covered([])),
                readRemote: vi.fn().mockResolvedValue([doc("r1", 900)]),
                observeRemote: vi.fn((_q, _t, onChanges) => {
                    socketPush = onChanges;
                }),
            },
        };
        const session = new QuerySession(() => page1, { live: true }, capabilities, {
            publish: vi.fn(),
            pending: vi.fn(),
            error: vi.fn(),
        });
        session.rebuild(page1);
        await flush();

        // A socket upsert adds a doc to the remote contribution that was never fetched by
        // a page POST — an old edited doc, say, with an extreme sort value.
        socketPush?.({ docs: [doc("socket-pushed", 1)] } as any, matchesAll, () => false);

        session.extend();
        await flush();

        // The next slice's plan must see only the fetched doc, never the socket-pushed one.
        expect(seen[1]).toEqual([doc("r1", 900)]);
    });

    it("keeps advancing when every row ties on the sort field", async () => {
        // The failure this guards: a bare `$lt` past the boundary drops every tying row,
        // and a `$lte` re-requests the same page forever. Either way the window stops
        // growing and paging dies — on data as ordinary as a day's worth of publishing.
        const h = harness();
        vi.mocked(h.capabilities.sources.readLocal).mockResolvedValue(covered([]));
        vi.mocked(h.capabilities.sources.readRemote).mockResolvedValue([
            doc("r1", 900),
            doc("r2", 900),
        ]);
        h.session.rebuild(page1);
        await flush();
        expect(h.publish).toHaveBeenLastCalledWith([doc("r1", 900), doc("r2", 900)]);

        vi.mocked(h.capabilities.sources.readRemote).mockResolvedValue([
            doc("r3", 900),
            doc("r4", 900),
        ]);
        h.session.extend();
        await flush();

        const second = vi.mocked(h.capabilities.sources.readRemote).mock.calls[1][0];
        const admits = mangoCompile(second.selector);
        expect(admits({ type: "content", _id: "r1", publishDate: 900 })).toBe(false); // held
        expect(admits({ type: "content", _id: "r3", publishDate: 900 })).toBe(true); // unseen
        expect(second.$limit).toBe(2); // 4 requested − 2 held

        expect(h.publish).toHaveBeenLastCalledWith([
            doc("r1", 900),
            doc("r2", 900),
            doc("r3", 900),
            doc("r4", 900),
        ]);
    });

    it("the browser plan uses it, so a later page asks only for rows past the boundary", async () => {
        const h = harness();
        vi.mocked(h.capabilities.sources.readLocal).mockResolvedValue(covered([doc("a", 3000)]));
        vi.mocked(h.capabilities.sources.readRemote).mockResolvedValue([doc("r1", 900)]);
        h.session.rebuild(page1);
        await flush();
        const first = vi.mocked(h.capabilities.sources.readRemote).mock.calls[0][0];

        vi.mocked(h.capabilities.sources.readLocal).mockResolvedValue(
            covered([doc("a", 3000), doc("b", 2000)]),
        );
        h.session.extend();
        await flush();
        const second = vi.mocked(h.capabilities.sources.readRemote).mock.calls[1][0];

        // Page 1 has nothing held, so it starts from the cutoff and asks for its shortfall.
        expect(first.$limit).toBe(1); // 2 requested - 1 local
        // Page 2 holds r1, so it asks only for what the window still lacks (a+b+r1 of 4)…
        expect(second.$limit).toBe(1);
        // …and narrows past r1's publishDate rather than restarting from the cutoff.
        expect(JSON.stringify(second.selector)).not.toEqual(JSON.stringify(first.selector));
        expect(JSON.stringify(second.selector)).toContain('"$lt":900');
    });
});

describe("QuerySession: partial remote fan-out failure", () => {
    it("reports an error even when some — not all — fanned-out sub-queries succeed", async () => {
        const capabilities: QueryCapabilities<BaseDocumentDto> = {
            plan: () => ({
                useLocal: false,
                remote: () => ({
                    selector: { $and: [{ type: "content" }, { parentId: { $in: ["p1", "p2"] } }] },
                    $sort: [{ publishDate: "desc" }],
                } as MangoQuery),
            }),
            sources: {
                readLocal: vi.fn().mockResolvedValue(covered([])),
                readRemote: vi
                    .fn()
                    .mockImplementationOnce(() => Promise.resolve([doc("p1-doc", 900)]))
                    .mockImplementationOnce(() => Promise.reject(new Error("HTTP 500"))),
            },
        };
        const publish = vi.fn();
        const error = vi.fn();
        const session = new QuerySession(() => page1, {}, capabilities, {
            publish,
            pending: vi.fn(),
            error,
        });
        session.rebuild(page1);
        await flush();

        // The one successful branch still publishes…
        expect(publish).toHaveBeenLastCalledWith([doc("p1-doc", 900)]);
        // …but the caller is told a sub-query failed, matching the pre-fan-out contract
        // where any single query failure was reported.
        expect(error).toHaveBeenCalled();
    });
});
