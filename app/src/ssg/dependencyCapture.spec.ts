import { afterEach, describe, expect, it } from "vitest";
import { reportCacheEntry, reportKeys } from "./dependencyCapture";

type CaptureState = {
    manifest: Record<string, Set<string>>;
    cache: Record<string, Record<string, string>>;
};

const GLOBAL_KEY = "__SSG_DEPS__";
const globalCapture = () => (globalThis as Record<string, unknown>)[GLOBAL_KEY] as
    | CaptureState
    | undefined;

function activateCapture(initial: Partial<CaptureState> = {}): void {
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
        manifest: {},
        cache: {},
        ...initial,
    } as CaptureState;
}

describe("dependencyCapture", () => {
    afterEach(() => {
        delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
    });

    it("is a no-op when no capture is active (client/native build)", () => {
        expect(globalCapture()).toBeUndefined();
        expect(() => reportKeys("/a", ["doc:p1"])).not.toThrow();
        expect(() => reportCacheEntry("/a", "hqcache:x", "{}")).not.toThrow();
        expect(globalCapture()).toBeUndefined();
    });

    it("files reported keys under the route that read them", () => {
        activateCapture();

        reportKeys("/a", ["doc:p1", "facet:parentId:p1:lang-eng"]);

        expect([...globalCapture()!.manifest["/a"]]).toEqual([
            "doc:p1",
            "facet:parentId:p1:lang-eng",
        ]);
    });

    it("de-duplicates keys across multiple reportKeys calls for one route (a Set, not a list)", () => {
        activateCapture();

        reportKeys("/a", ["doc:p1"]);
        reportKeys("/a", ["doc:p1", "doc:p2"]);

        expect([...globalCapture()!.manifest["/a"]]).toEqual(["doc:p1", "doc:p2"]);
    });

    it("keeps concurrently-rendered routes' keys apart", () => {
        activateCapture();

        // Interleaved exactly as concurrent renders would report them.
        reportKeys("/a", ["doc:p1"]);
        reportKeys("/b", ["doc:p2"]);
        reportKeys("/a", ["doc:p3"]);

        expect([...globalCapture()!.manifest["/a"]]).toEqual(["doc:p1", "doc:p3"]);
        expect([...globalCapture()!.manifest["/b"]]).toEqual(["doc:p2"]);
    });

    it("leaves other routes' manifest entries untouched", () => {
        activateCapture({ manifest: { "/already-rendered": new Set(["doc:old"]) } });

        reportKeys("/new", ["doc:new"]);

        expect([...globalCapture()!.manifest["/already-rendered"]]).toEqual(["doc:old"]);
    });

    it("keeps concurrently-rendered routes' cache seeds apart", () => {
        activateCapture();

        reportCacheEntry("/a", "hqcache:a1", '{"local":[]}');
        reportCacheEntry("/b", "hqcache:b1", '{"local":[1]}');
        reportCacheEntry("/a", "hqcache:a2", '{"local":[2]}');

        expect(globalCapture()!.cache["/a"]).toEqual({
            "hqcache:a1": '{"local":[]}',
            "hqcache:a2": '{"local":[2]}',
        });
        expect(globalCapture()!.cache["/b"]).toEqual({ "hqcache:b1": '{"local":[1]}' });
    });
});
