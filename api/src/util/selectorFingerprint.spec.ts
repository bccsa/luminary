import { selectorFingerprint } from "./selectorFingerprint";

describe("selectorFingerprint", () => {
    it("strips values so queries differing only in values share a fingerprint", () => {
        const a = selectorFingerprint({
            selector: { type: "content", memberOf: { $elemMatch: { $in: ["g1", "g2"] } } },
        });
        const b = selectorFingerprint({
            selector: { type: "content", memberOf: { $elemMatch: { $in: ["g3"] } } },
        });
        expect(a).toBe(b);
    });

    it("keeps operator and field names", () => {
        const fp = selectorFingerprint({ selector: { publishDate: { $gte: 1000 } } });
        expect(fp).toContain("publishDate");
        expect(fp).toContain("$gte");
    });

    it("is stable regardless of object key order", () => {
        const a = selectorFingerprint({ selector: { type: "content", parentType: "post" } });
        const b = selectorFingerprint({ selector: { parentType: "post", type: "content" } });
        expect(a).toBe(b);
    });

    it("differs when the structure differs", () => {
        const a = selectorFingerprint({ selector: { type: "content" } });
        const b = selectorFingerprint({ selector: { type: "content", parentType: "post" } });
        expect(a).not.toBe(b);
    });

    it("preserves the structure of arrays of objects ($or branches)", () => {
        const a = selectorFingerprint({
            selector: { $or: [{ parentType: "post" }, { parentType: "tag" }] },
        });
        const b = selectorFingerprint({ selector: { $or: [{ parentType: "post" }] } });
        // Different number of branches → different fingerprint.
        expect(a).not.toBe(b);
    });

    it("includes use_index but not limit (limit is a value, not shape)", () => {
        const withIdx = selectorFingerprint({ selector: { type: "post" }, use_index: "sync-post-index" });
        const without = selectorFingerprint({ selector: { type: "post" } });
        expect(withIdx).toContain("sync-post-index");
        expect(withIdx).not.toBe(without);

        const limitA = selectorFingerprint({ selector: { type: "post" }, limit: 10 });
        const limitB = selectorFingerprint({ selector: { type: "post" }, limit: 500 });
        expect(limitA).toBe(limitB);
    });

    it("truncates very large skeletons", () => {
        const branches: any[] = [];
        for (let i = 0; i < 5000; i++) branches.push({ ["field" + i]: i });
        const fp = selectorFingerprint({ selector: { $and: branches } });
        expect(fp.length).toBeLessThanOrEqual(1025);
        expect(fp.endsWith("…")).toBe(true);
    });
});
