import { isExpiredContent, stripExpiredContent } from "./stripExpiredContent";
import { DocType, PublishStatus } from "../enums";

const now = 1_000_000;

function contentDoc(overrides: Record<string, any> = {}) {
    return {
        _id: "content-1",
        _rev: "1-abc",
        type: DocType.Content,
        parentId: "post-1",
        parentType: DocType.Post,
        memberOf: ["group-1"],
        language: "lang-eng",
        status: PublishStatus.Published,
        publishDate: 500,
        expiryDate: 900, // < now → expired
        updatedTimeUtc: 12345,
        // body fields that must be stripped:
        slug: "my-slug",
        title: "My title",
        summary: "Summary",
        author: "Author",
        text: "<p>Body text</p>",
        seoTitle: "SEO",
        seoString: "seo string",
        audio: "audio-1",
        video: "video-1",
        localisedImage: "img-1",
        parentTags: ["tag-1"],
        availableTranslations: ["lang-fra"],
        fts: ["abc:3"],
        ftsTokenCount: 3,
        ...overrides,
    };
}

describe("isExpiredContent", () => {
    it("is true for a published Content doc past its expiry date", () => {
        expect(isExpiredContent(contentDoc(), now)).toBe(true);
    });

    it("is false for a published Content doc not yet expired", () => {
        expect(isExpiredContent(contentDoc({ expiryDate: now + 1000 }), now)).toBe(false);
    });

    it("is false for a published Content doc with no expiry date", () => {
        expect(isExpiredContent(contentDoc({ expiryDate: undefined }), now)).toBe(false);
    });

    it("is false for a draft Content doc (drafts never reach non-CMS clients)", () => {
        expect(isExpiredContent(contentDoc({ status: PublishStatus.Draft }), now)).toBe(false);
    });

    it("is false for non-Content docs", () => {
        expect(isExpiredContent({ type: DocType.Post, expiryDate: 1 }, now)).toBe(false);
    });

    it("is false for null/undefined", () => {
        expect(isExpiredContent(null, now)).toBe(false);
        expect(isExpiredContent(undefined, now)).toBe(false);
    });
});

describe("stripExpiredContent", () => {
    const keep = [
        "_id",
        "_rev",
        "type",
        "parentId",
        "parentType",
        "memberOf",
        "language",
        "status",
        "publishDate",
        "expiryDate",
        "updatedTimeUtc",
    ];
    const drop = [
        "slug",
        "title",
        "summary",
        "author",
        "text",
        "seoTitle",
        "seoString",
        "audio",
        "video",
        "localisedImage",
        "parentTags",
        "availableTranslations",
        "fts",
        "ftsTokenCount",
    ];

    it("keeps only the cleanup-stub fields and drops all body/FTS fields", () => {
        const stub = stripExpiredContent(contentDoc());
        for (const f of keep) expect(stub).toHaveProperty(f);
        for (const f of drop) expect(stub).not.toHaveProperty(f);
    });

    it("does not mutate the input doc", () => {
        const doc = contentDoc();
        stripExpiredContent(doc);
        expect(doc.title).toBe("My title");
        expect(doc.fts).toEqual(["abc:3"]);
    });

    it("omits keep-list fields that are absent rather than emitting undefined", () => {
        const stub = stripExpiredContent(contentDoc({ _rev: undefined, parentType: undefined }));
        expect(stub).not.toHaveProperty("_rev");
        expect(stub).not.toHaveProperty("parentType");
        expect(stub._id).toBe("content-1");
    });
});
