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

    it("sweeps expired entries on insert once the sweep interval has passed", () => {
        const c = make<string>({ sweepIntervalMs: 5000 });
        c.set("a", "v", 1000);
        c.set("b", "v", 1000);
        nowMs += 1000; // a and b expired, but never read again
        c.set("c", "v", 1000); // interval not yet passed → no sweep
        expect(c.size).toBe(3);

        nowMs += 4000;
        c.set("d", "v", 1000); // interval passed → sweep first
        expect(c.size).toBe(1);
        expect(c.get("d")).toBe("v");
    });

    it("evicts the oldest entry at maxEntries even when every entry is live", () => {
        const c = make<string>({ maxEntries: 3 });
        for (let i = 0; i < 10; i++) c.set(`k${i}`, "v", 60_000);
        expect(c.size).toBe(3);
        expect(c.get("k6")).toBeUndefined();
        expect(c.get("k7")).toBe("v");
        expect(c.get("k9")).toBe("v");
    });

    it("treats an overwritten key as newest, so it is not the next to be evicted", () => {
        const c = make<string>({ maxEntries: 2 });
        c.set("a", "v1", 60_000);
        c.set("b", "v", 60_000);
        c.set("a", "v2", 60_000); // a moves behind b
        c.set("c", "v", 60_000); // evicts b, the oldest
        expect(c.get("b")).toBeUndefined();
        expect(c.get("a")).toBe("v2");
        expect(c.get("c")).toBe("v");
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
