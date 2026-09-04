import { ContentDto } from "../dto/ContentDto";
import { PublishStatus } from "../enums";
import { foldPreviousSlugs, isTrackableSlugChange } from "./computePreviousSlugs";

const baseDoc = (overrides: Partial<ContentDto> = {}): ContentDto =>
    ({
        _id: "content-1",
        type: "content",
        memberOf: [],
        parentId: "post-1",
        language: "lang-eng",
        status: PublishStatus.Published,
        title: "Title",
        slug: "slug-b",
        parentTags: [],
        ...overrides,
    }) as ContentDto;

describe("isTrackableSlugChange", () => {
    it("is false without a previous doc", () => {
        expect(isTrackableSlugChange(baseDoc(), undefined)).toBe(false);
    });

    it("is false when the slug did not change", () => {
        const prev = baseDoc({ slug: "slug-b" });
        expect(isTrackableSlugChange(baseDoc({ slug: "slug-b" }), prev)).toBe(false);
    });

    it("is false when either revision is a draft", () => {
        const prev = baseDoc({ slug: "slug-a", status: PublishStatus.Draft });
        expect(isTrackableSlugChange(baseDoc(), prev)).toBe(false);
    });

    it("is false when either revision is being deleted", () => {
        const prev = baseDoc({ slug: "slug-a" });
        expect(isTrackableSlugChange(baseDoc({ deleteReq: 1 }), prev)).toBe(false);
        expect(isTrackableSlugChange(baseDoc(), { ...prev, deleteReq: 1 })).toBe(false);
    });

    it("is false when either revision is not yet live (future publishDate)", () => {
        const future = Date.now() + 100000;
        const prev = baseDoc({ slug: "slug-a" });
        expect(isTrackableSlugChange(baseDoc({ publishDate: future }), prev)).toBe(false);
        expect(isTrackableSlugChange(baseDoc(), { ...prev, publishDate: future })).toBe(false);
    });

    it("is false when either revision has already expired", () => {
        const past = Date.now() - 1000;
        const prev = baseDoc({ slug: "slug-a" });
        expect(isTrackableSlugChange(baseDoc({ expiryDate: past }), prev)).toBe(false);
        expect(isTrackableSlugChange(baseDoc(), { ...prev, expiryDate: past })).toBe(false);
    });

    it("is true for a live published-to-published rename", () => {
        const prev = baseDoc({ slug: "slug-a" });
        expect(isTrackableSlugChange(baseDoc({ slug: "slug-b" }), prev)).toBe(true);
    });
});

describe("foldPreviousSlugs", () => {
    it("appends the vacated slug when there is no prior history", () => {
        const prev = baseDoc({ slug: "slug-a" });
        const doc = baseDoc({ slug: "slug-b" });
        expect(foldPreviousSlugs(doc, prev)).toEqual(["slug-a"]);
    });

    it("carries forward prior history alongside the newly vacated slug", () => {
        const prev = baseDoc({ slug: "slug-b", previousSlugs: ["slug-a"] });
        const doc = baseDoc({ slug: "slug-c" });
        expect(foldPreviousSlugs(doc, prev)).toEqual(["slug-a", "slug-b"]);
    });

    it("drops the entry matching the new slug (reversion) and folds in the vacated one", () => {
        const prev = baseDoc({ slug: "slug-b", previousSlugs: ["slug-a"] });
        const doc = baseDoc({ slug: "slug-a" });
        expect(foldPreviousSlugs(doc, prev)).toEqual(["slug-b"]);
    });
});
