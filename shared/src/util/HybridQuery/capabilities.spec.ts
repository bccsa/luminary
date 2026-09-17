import { afterEach, describe, expect, it, vi } from "vitest";
import type { BaseDocumentDto, ApiDataResponseDto } from "../../types";
import type { LocalRead, QueryCapabilities } from "./contracts";
import { planBrowserQuery } from "./browserPlanner";
import type { HybridQueryOptions } from "./options";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import { QuerySession } from "./querySession";
import { ResultWindow } from "./resultWindow";
import { createResponseCache } from "./cacheStorage";
import { encodeWindow, decodeWindow, structuralCacheKey } from "./cacheCodec";

const content = { selector: { type: "content" } } as MangoQuery;
const doc = (id: string, time = 1) =>
    ({ _id: id, updatedTimeUtc: time, type: "content" }) as BaseDocumentDto;
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
async function flush() {
    for (let i = 0; i < 8; i++) await Promise.resolve();
}

const covered = (docs: BaseDocumentDto[]): LocalRead<BaseDocumentDto> => ({
    docs,
    covered: true,
});

function harness(options: HybridQueryOptions = {}) {
    const publish = vi.fn();
    const pending = vi.fn();
    const error = vi.fn();
    const capabilities: QueryCapabilities<BaseDocumentDto> = {
        // Read coverage lazily so a test can retune the cutoff after construction.
        plan: (query) => planBrowserQuery(query, capabilities.coverage),
        sources: {
            readLocal: vi.fn().mockResolvedValue(covered([])),
            readRemote: vi.fn().mockResolvedValue([]),
            observeLocal: vi.fn(),
            observeRemote: vi.fn(),
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
    const session = new QuerySession(() => content, options, capabilities, {
        publish,
        pending,
        error,
    });
    return { session, capabilities, publish, pending, error };
}

afterEach(() => vi.restoreAllMocks());

describe("query session contracts", () => {
    it("hands a seed to the observer synchronously, then replaces it only after the empty supplement answers", async () => {
        const h = harness({ cache: true });
        const local = deferred<LocalRead<BaseDocumentDto>>();
        const remote = deferred<BaseDocumentDto[]>();
        vi.mocked(h.capabilities.sources.readLocal).mockReturnValue(local.promise);
        vi.mocked(h.capabilities.sources.readRemote).mockReturnValue(remote.promise);
        // Compose another session with the cache present at construction time.
        h.capabilities.cache = {
            key: () => "seed",
            read: () => ({ local: [doc("seed")] as any, remote: [] }),
            write: vi.fn(),
        };
        const session = new QuerySession(() => content, {}, h.capabilities, h);
        session.rebuild(content);
        expect(h.publish).toHaveBeenLastCalledWith([doc("seed")]);
        local.resolve(covered([]));
        await flush();
        expect(h.publish).toHaveBeenCalledTimes(1);
        remote.resolve([]);
        await flush();
        expect(h.publish).toHaveBeenLastCalledWith([]);
        expect(h.pending).toHaveBeenLastCalledWith({
            local: false,
            remote: false,
            kind: "initial",
            more: false,
        });
        expect(h.capabilities.cache.write).toHaveBeenLastCalledWith(
            "seed",
            { local: [], remote: [] },
            undefined,
            [],
        );
        session.dispose();
    });

    it("ignores source callbacks and HTTP results from rebuilt or disposed generations", async () => {
        const h = harness({ live: true });
        const listeners: Array<(docs: BaseDocumentDto[]) => void> = [];
        const stops: Array<ReturnType<typeof vi.fn>> = [];
        vi.mocked(h.capabilities.sources.observeLocal).mockImplementation(
            (_q, value, _error, own) => {
                listeners.push(value);
                const stop = vi.fn();
                stops.push(stop);
                own(stop);
            },
        );
        const remote = deferred<BaseDocumentDto[]>();
        vi.mocked(h.capabilities.sources.readRemote).mockReturnValue(remote.promise);
        h.session.rebuild(content);
        listeners[0]([]);
        h.session.rebuild(content);
        expect(stops[0]).toHaveBeenCalledTimes(1);
        listeners[0]([doc("obsolete-local")]);
        remote.resolve([doc("obsolete-remote")]);
        await flush();
        expect(h.publish).not.toHaveBeenCalled();
        h.session.dispose();
        h.session.dispose();
        listeners[1]([doc("after-dispose")]);
        expect(stops[1]).toHaveBeenCalledTimes(1);
        expect(h.publish).not.toHaveBeenCalled();
    });

    it("retains cleanup registered before a subscription setup throws", () => {
        const h = harness({ live: true });
        const stop = vi.fn();
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(h.capabilities.sources.observeLocal).mockImplementation(
            (_q, _value, _error, own) => {
                own(stop);
                throw new Error("setup failed");
            },
        );
        h.session.rebuild(content);
        expect(log).toHaveBeenCalled();
        h.session.dispose();
        expect(stop).toHaveBeenCalledTimes(1);
    });

    it("uses only a finite local read for a fully covered one-shot query", async () => {
        const h = harness();
        h.capabilities.coverage.cutoff = () => Number.MIN_SAFE_INTEGER;
        vi.mocked(h.capabilities.sources.readLocal).mockResolvedValue(covered([doc("local")]));
        h.session.rebuild(content);
        await flush();
        expect(h.publish).toHaveBeenLastCalledWith([doc("local")]);
        expect(h.capabilities.sources.readRemote).not.toHaveBeenCalled();
        expect(h.capabilities.sources.observeLocal).not.toHaveBeenCalled();
        expect(h.capabilities.sources.observeRemote).not.toHaveBeenCalled();
        expect(h.capabilities.sources.watchConnection).not.toHaveBeenCalled();
        expect(h.capabilities.sources.joinRooms).not.toHaveBeenCalled();
        expect(h.pending).toHaveBeenLastCalledWith({
            local: false,
            remote: false,
            kind: "initial",
            more: false,
        });
        h.session.dispose();
    });

    it("preserves successful fan-out branches, but still reports the failed one", async () => {
        const h = harness();
        vi.spyOn(console, "error").mockImplementation(() => {});
        const secondParentFailure = new Error("second parent failed");
        vi.mocked(h.capabilities.sources.readRemote)
            .mockResolvedValueOnce([doc("success")])
            .mockRejectedValueOnce(secondParentFailure);
        h.session.rebuild({
            selector: { $and: [{ type: "content" }, { parentId: { $in: ["a", "b"] } }] },
        });
        await flush();
        expect(h.capabilities.sources.readRemote).toHaveBeenCalledTimes(2);
        // The successful branch still publishes…
        expect(h.publish).toHaveBeenLastCalledWith([doc("success")]);
        // …but the caller is told a branch failed — a caller that must not act on a
        // partial fan-out result (e.g. an SSG one-shot read) needs to see this.
        expect(h.error).toHaveBeenCalledTimes(2); // rebuild's initial clear, then the failure
        expect(h.error).toHaveBeenLastCalledWith(secondParentFailure);
        h.session.dispose();
    });
});

describe("result and hydration contracts", () => {
    it("restores a fuller document at the same revision and preserves socket data that races the POST", () => {
        const publish = vi.fn();
        const window = new ResultWindow<BaseDocumentDto>({
            publish,
            touchLocal: () => {},
            validateDelete: () => true,
        });
        window.reset(content, false);
        window.seed({ local: [doc("local")], remote: [doc("old-seed")] });
        const full = { ...doc("local"), text: "restored body" };
        window.setLocal([full], true);
        expect(publish.mock.lastCall?.[0][0]).toHaveProperty("text", "restored body");
        window.applySocketData(
            { docs: [doc("socket", 3)] } as ApiDataResponseDto,
            () => true,
            () => true,
        );
        window.setRemote([doc("post")]);
        expect(publish.mock.lastCall?.[0].map((d: BaseDocumentDto) => d._id)).toEqual([
            "local",
            "socket",
            "post",
        ]);
    });

    it("keeps a socket deletion effective until local storage catches up, but allows a newer revision", () => {
        const publish = vi.fn();
        const window = new ResultWindow<BaseDocumentDto>({
            publish,
            touchLocal: () => {},
            validateDelete: () => true,
        });
        window.reset(content, false);
        window.setLocal([doc("a")], false);
        window.applySocketData(
            { docs: [{ type: "deleteCmd", docId: "a", updatedTimeUtc: 2 }] } as ApiDataResponseDto,
            () => true,
            () => true,
        );
        window.setLocal([doc("a")], false);
        expect(publish).toHaveBeenLastCalledWith([]);
        window.setLocal([doc("a", 3)], false);
        expect(publish).toHaveBeenLastCalledWith([doc("a", 3)]);
    });
});

describe("cache capability", () => {
    it("keeps the legacy byte format and first-bucket budget without browser storage", () => {
        const encoded = encodeWindow({ local: [doc("a")], remote: [doc("b")] }, 1);
        expect(encoded).toBe(
            '{"local":[{"_id":"a","updatedTimeUtc":1,"type":"content"}],"remote":[]}',
        );
        expect(decodeWindow(encoded)).toEqual({ local: [doc("a")], remote: [] });
        expect(structuralCacheKey({ selector: { parentId: "a" } })).toEqual(
            structuralCacheKey({ selector: { parentId: "b" } }),
        );
    });

    it("removes a stale entry on a failed write and tolerates unavailable storage", () => {
        const store = new Map<string, string>();
        let full = false;
        const cache = createResponseCache(() => ({
            getItem: (key) => store.get(key) ?? null,
            setItem: (key, value) => {
                if (full) throw new Error("quota");
                store.set(key, value);
            },
            removeItem: (key) => {
                store.delete(key);
            },
            get length() {
                return store.size;
            },
            key: (index) => [...store.keys()][index] ?? null,
        }));
        cache.write("entry", { local: [doc("old")], remote: [] });
        full = true;
        cache.write("entry", { local: [doc("new")], remote: [] });
        expect(cache.read("entry")).toBeUndefined();
        const unavailable = createResponseCache(() => {
            throw new Error("no storage");
        });
        expect(unavailable.read("entry")).toBeUndefined();
        expect(() => unavailable.write("entry", { local: [], remote: [] })).not.toThrow();
        expect(() => unavailable.clear()).not.toThrow();
    });

    it("loads pure capabilities without importing Vue, database, HTTP, sockets or global configuration", async () => {
        const blocked = [
            "vue",
            "../../db/database",
            "../../api/http",
            "../../socket/socketio",
            "../../config",
        ];
        vi.resetModules();
        blocked.forEach((path) =>
            vi.doMock(path, () => {
                throw new Error(`environment import: ${path}`);
            }),
        );
        try {
            const modules = await Promise.all([
                import("./querySession"),
                import("./resultWindow"),
                import("./queryPlanner"),
                import("./cacheCodec"),
                import("./cacheStorage"),
                import("./seedRetention"),
            ]);
            expect(modules).toHaveLength(6);
        } finally {
            blocked.forEach((path) => vi.doUnmock(path));
            vi.resetModules();
        }
    });
});
