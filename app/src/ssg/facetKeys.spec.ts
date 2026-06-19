// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { ContentDto } from "luminary-shared";
import { facetsFromDoc, facetsFromSelector, docKey } from "./facetKeys";

/**
 * The core invariant of the facet-key system: for any query a page runs and any
 * doc that participates in its result set, the page's captured keys and the
 * changed doc's keys must INTERSECT — so a content change invalidates exactly the
 * pages that read it, with no per-page wiring. This is the regression guard for
 * "rearranging layout / adding a query needs no key changes".
 */

const L = "lang-eng";
const intersects = (a: string[], b: string[]) => a.some((k) => b.includes(k));
const doc = (over: Partial<ContentDto>): ContentDto =>
    ({ _id: "c1", type: "content", language: L, ...over }) as ContentDto;

describe("facetKeys — selector ∩ doc", () => {
    it("pinned feed: parentPinned:1 matches a pinned doc", () => {
        const sel = facetsFromSelector({ $and: [{ parentPinned: 1 }] }, L);
        const d = facetsFromDoc(doc({ parentPinned: 1 }));
        expect(sel).toContain(`facet:parentPinned:1:${L}`);
        expect(intersects(sel, d)).toBe(true);
    });

    it("parentId $in list matches a doc with that parentId (related/pinned content)", () => {
        const sel = facetsFromSelector({ $and: [{ parentId: { $in: ["P1", "P2"] } }] }, L);
        const d = facetsFromDoc(doc({ parentId: "P1" }));
        expect(sel).toContain(`facet:parentId:P1:${L}`);
        expect(intersects(sel, d)).toBe(true);
    });

    it("parentTags $elemMatch matches a doc carrying that tag", () => {
        const sel = facetsFromSelector(
            { $and: [{ parentTags: { $elemMatch: { $in: ["T1"] } } }] },
            L,
        );
        const d = facetsFromDoc(doc({ parentTags: ["T1", "T2"] }));
        expect(intersects(sel, d)).toBe(true);
    });

    it("a returned tile's doc key matches the changed doc (card-display edits)", () => {
        // useContentQuery reports docKey(parentId) per returned tile; the watcher
        // emits the same from the changed doc.
        const d = facetsFromDoc(doc({ parentId: "P1" }));
        expect(d).toContain(docKey("P1"));
    });

    it("is language-scoped: an English page is NOT invalidated by a French doc change", () => {
        const sel = facetsFromSelector({ $and: [{ parentId: { $in: ["P1"] } }] }, "lang-eng");
        const frDoc = facetsFromDoc(doc({ parentId: "P1", language: "lang-fra" }));
        // doc: identity is shared across translations (parentId), so that one key
        // CAN match — but the facet:parentId keys differ by language suffix.
        expect(sel).not.toContain("facet:parentId:P1:lang-fra");
        expect(frDoc).not.toContain("facet:parentId:P1:lang-eng");
    });

    it("negative / range filters emit no facet ($ne, $exists)", () => {
        expect(facetsFromSelector({ $and: [{ parentPostType: { $ne: "page" } }] }, L)).toEqual([]);
        expect(facetsFromSelector({ $and: [{ parentTagType: { $exists: false } }] }, L)).toEqual([]);
    });
});
