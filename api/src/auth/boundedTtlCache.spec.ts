import { BoundedTtlCache, BoundedTtlCacheOptions } from "./boundedTtlCache";

describe("BoundedTtlCache", () => {
    let nowMs: number;
    const now = () => nowMs;

    const make = <V>(over: Partial<BoundedTtlCacheOptions> = {}) =>
        new BoundedTtlCache<V>({ now, ...over });

    beforeEach(() => {
        nowMs = 0;
    });

    it("returns undefined for an unknown key", () => {
        const c = make<string>();
        expect(c.get("nope")).toBeUndefined();
    });

    it("returns a stored value within its TTL", () => {
        const c = make<string>();
        c.set("k", "v", 1000);
        expect(c.get("k")).toBe("v");
    });

    it("expires a value once its TTL elapses, and drops it lazily on get", () => {
        const c = make<string>();
        c.set("k", "v", 1000);
        nowMs += 1000; // expiresAt (0 + 1000) <= now → expired
        expect(c.get("k")).toBeUndefined();
        expect(c.size).toBe(0);
    });

    it("treats a non-positive ttl as a no-op (does not cache)", () => {
        const c = make<string>();
        c.set("k", "v", 0);
        c.set("k2", "v", -5);
        expect(c.get("k")).toBeUndefined();
        expect(c.size).toBe(0);
    });

    it("overwrites an existing key without growing size", () => {
        const c = make<string>();
        c.set("k", "v1", 1000);
        c.set("k", "v2", 1000);
        expect(c.get("k")).toBe("v2");
        expect(c.size).toBe(1);
    });

    it("sweeps expired entries when maxEntries is reached on insert", () => {
        const c = make<string>({ maxEntries: 2 });
        c.set("a", "v", 1000);
        c.set("b", "v", 1000);
        expect(c.size).toBe(2);
        nowMs += 1000; // a and b now expired
        c.set("c", "v", 1000); // size >= maxEntries → sweep first
        expect(c.size).toBe(1);
        expect(c.get("c")).toBe("v");
        expect(c.get("a")).toBeUndefined();
    });

    it("clear() drops everything", () => {
        const c = make<string>();
        c.set("a", "v", 1000);
        c.set("b", "v", 1000);
        c.clear();
        expect(c.size).toBe(0);
    });

    it("delete() removes a single key", () => {
        const c = make<string>();
        c.set("a", "v", 1000);
        c.set("b", "v", 1000);
        c.delete("a");
        expect(c.get("a")).toBeUndefined();
        expect(c.get("b")).toBe("v");
    });

    it("keeps keys independent", () => {
        const c = make<string>();
        c.set("a", "va", 1000);
        c.set("b", "vb", 5000);
        nowMs += 1000; // a expired, b still live
        expect(c.get("a")).toBeUndefined();
        expect(c.get("b")).toBe("vb");
    });
});
