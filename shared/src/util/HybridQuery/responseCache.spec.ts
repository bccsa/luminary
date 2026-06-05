import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    readResponseCache,
    structuralCacheKey,
    writeResponseCache,
} from "./responseCache";
import type { MangoQuery } from "../MangoQuery/MangoTypes";

// The internal localStorage namespace — kept in sync with responseCache.ts so a
// test can inject a raw/corrupt entry under the exact key the reader looks up.
const STORAGE_PREFIX = "hqcache:";

const doc = (id: string, ts = 1) => ({ _id: id, updatedTimeUtc: ts }) as any;
const win = (local: any[], remote: any[]) => ({ local, remote });

describe("responseCache", () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    describe("structuralCacheKey", () => {
        it("ignores variable values — same shape, different values ⇒ same key", () => {
            const en: MangoQuery = {
                selector: { $and: [{ type: "content" }, { language: { $in: ["en"] } }] },
            };
            const fr: MangoQuery = {
                selector: { $and: [{ type: "content" }, { language: { $in: ["fr", "de"] } }] },
            };
            expect(structuralCacheKey(en)).toBe(structuralCacheKey(fr));
        });

        it("collides on identical shape but different constant (documented caveat)", () => {
            const cat: MangoQuery = { selector: { type: "content", parentTagType: "category" } };
            const topic: MangoQuery = { selector: { type: "content", parentTagType: "topic" } };
            expect(structuralCacheKey(cat)).toBe(structuralCacheKey(topic));
        });

        it("distinguishes different shapes", () => {
            const a: MangoQuery = { selector: { type: "content", parentPinned: 1 } };
            const b: MangoQuery = { selector: { type: "content", parentTagType: "topic" } };
            expect(structuralCacheKey(a)).not.toBe(structuralCacheKey(b));
        });

        it("distinguishes by $sort, $limit, and use_index", () => {
            const base: MangoQuery = { selector: { type: "content" } };
            const sorted: MangoQuery = { ...base, $sort: [{ publishDate: "desc" }] };
            const limited: MangoQuery = { ...base, $limit: 10 };
            const limited20: MangoQuery = { ...base, $limit: 20 };
            const indexed: MangoQuery = { ...base, use_index: "content-publishDate-index" };

            const k = structuralCacheKey(base);
            expect(structuralCacheKey(sorted)).not.toBe(k);
            expect(structuralCacheKey(limited)).not.toBe(k);
            expect(structuralCacheKey(limited)).not.toBe(structuralCacheKey(limited20));
            expect(structuralCacheKey(indexed)).not.toBe(k);
        });
    });

    describe("readResponseCache", () => {
        it("returns undefined on a miss", () => {
            expect(readResponseCache("nope")).toBeUndefined();
        });

        it("round-trips a written window, split by source", () => {
            writeResponseCache("k", win([doc("a")], [doc("b")]));
            expect(readResponseCache("k")).toEqual(win([doc("a")], [doc("b")]));
        });

        it("treats a both-empty entry as a miss", () => {
            writeResponseCache("k", win([], []));
            expect(readResponseCache("k")).toBeUndefined();
        });

        it("returns undefined on a corrupt entry", () => {
            localStorage.setItem(STORAGE_PREFIX + "k", "{not valid json");
            expect(readResponseCache("k")).toBeUndefined();
        });

        it("returns undefined on a wrong-shape (e.g. bare array) entry", () => {
            localStorage.setItem(STORAGE_PREFIX + "k", JSON.stringify([doc("a")]));
            expect(readResponseCache("k")).toBeUndefined();
        });

        it("returns undefined when a bucket is missing or not an array", () => {
            localStorage.setItem(
                STORAGE_PREFIX + "k1",
                JSON.stringify({ local: [doc("a")], remote: "nope" }),
            );
            localStorage.setItem(STORAGE_PREFIX + "k2", JSON.stringify({ local: [doc("a")] }));
            expect(readResponseCache("k1")).toBeUndefined();
            expect(readResponseCache("k2")).toBeUndefined();
        });

        it("returns undefined if localStorage.getItem throws", () => {
            vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
                throw new Error("access denied");
            });
            expect(readResponseCache("k")).toBeUndefined();
        });
    });

    describe("writeResponseCache", () => {
        it("caps the stored window to maxDocs TOTAL, local first", () => {
            const local = Array.from({ length: 5 }, (_, i) => doc(`L${i}`));
            const remote = Array.from({ length: 100 }, (_, i) => doc(`R${i}`));
            writeResponseCache("k", win(local, remote), 10);

            const read = readResponseCache("k");
            expect(read?.local).toHaveLength(5);
            expect(read?.remote).toHaveLength(5); // budget 10 - 5 local
        });

        it("gives the local bucket priority when it alone exceeds the cap", () => {
            const local = Array.from({ length: 100 }, (_, i) => doc(`L${i}`));
            writeResponseCache("k", win(local, [doc("R0")]), 10);

            const read = readResponseCache("k");
            expect(read?.local).toHaveLength(10);
            expect(read?.remote).toHaveLength(0);
        });

        it("defaults the cap to 50", () => {
            const local = Array.from({ length: 80 }, (_, i) => doc(`L${i}`));
            writeResponseCache("k", win(local, []));
            expect(readResponseCache("k")?.local).toHaveLength(50);
        });

        it("swallows a thrown setItem (e.g. QuotaExceededError) without propagating", () => {
            vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
                throw new DOMException("quota", "QuotaExceededError");
            });
            expect(() => writeResponseCache("k", win([doc("a")], []))).not.toThrow();
        });

        it("drops any stale entry for the key when the write overflows quota", () => {
            writeResponseCache("k", win([doc("old")], [])); // a valid entry exists
            expect(readResponseCache("k")).toBeTruthy();

            // Next write overflows: setItem throws, the catch removes the stale entry.
            vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
                throw new DOMException("quota", "QuotaExceededError");
            });
            writeResponseCache("k", win([doc("new")], []));
            vi.restoreAllMocks();

            expect(readResponseCache("k")).toBeUndefined();
        });
    });
});
