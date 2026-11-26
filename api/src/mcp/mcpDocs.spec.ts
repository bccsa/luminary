import * as z from "zod";
import { DocType, PublishStatus } from "../enums";
import { cmsLink, decodeCursor, docVersion, encodeCursor, trimDoc } from "./mcpDocs";

const content = {
    _id: "c1",
    _rev: "3-abc",
    type: DocType.Content,
    parentId: "p1",
    parentType: DocType.Post,
    parentPostType: "blog",
    language: "lang-eng",
    status: PublishStatus.Draft,
    title: "Title",
    text: "<p>Body</p>",
    fts: ["tit:1"],
    ftsTokenCount: 3,
    parentImageData: { fileCollections: [] },
    availableTranslations: ["lang-eng"],
    memberOf: ["g1"],
};

describe("docVersion", () => {
    it("ignores fields MCP can't write, so server cascades don't change it", () => {
        const cascaded = {
            ...content,
            availableTranslations: ["lang-eng", "lang-fra"],
            parentTags: ["t1"],
            updatedTimeUtc: 999,
            _rev: "4-def",
        };
        expect(docVersion(cascaded)).toBe(docVersion(content));
    });

    it("changes when an editable field changes", () => {
        expect(docVersion({ ...content, title: "Other" })).not.toBe(docVersion(content));
    });

    it("does not depend on key order", () => {
        const reordered = Object.fromEntries(Object.entries(content).reverse());
        expect(docVersion(reordered)).toBe(docVersion(content));
    });

    it("is undefined for doc types MCP can't write", () => {
        expect(docVersion({ _id: "g1", type: DocType.Group, name: "G" })).toBeUndefined();
    });
});

describe("trimDoc", () => {
    it("drops internal and bulky fields and adds the version", () => {
        const out = trimDoc(content);
        expect(out).not.toHaveProperty("_rev");
        expect(out).not.toHaveProperty("fts");
        expect(out).not.toHaveProperty("ftsTokenCount");
        expect(out).not.toHaveProperty("parentImageData");
        expect(out).not.toHaveProperty("text");
        expect(out.version).toBe(docVersion(content));
    });

    it("keeps the body when asked", () => {
        expect(trimDoc(content, { keepText: true }).text).toBe("<p>Body</p>");
    });

    it("hides both identity-provider ids on a User doc", () => {
        const out = trimDoc({
            _id: "u1",
            type: DocType.User,
            email: "a@b.test",
            externalUserId: "auth0|1",
            userId: "auth0|legacy",
        });
        expect(out).not.toHaveProperty("externalUserId");
        expect(out).not.toHaveProperty("userId");
        expect(out.email).toBe("a@b.test");
    });

    it("never returns storage credentials", () => {
        const out = trimDoc({
            _id: "s1",
            type: DocType.Storage,
            credential: { accessKey: "a", secretKey: "b" },
            credential_id: "crypto-1",
        });
        expect(out).not.toHaveProperty("credential");
        expect(out).not.toHaveProperty("credential_id");
    });

    it("drops a language's UI strings unless asked", () => {
        const lang = { _id: "l1", type: DocType.Language, translations: { a: "b" } };
        expect(trimDoc(lang)).not.toHaveProperty("translations");
        expect(trimDoc(lang, { keepTranslations: true }).translations).toEqual({ a: "b" });
    });
});

describe("cmsLink", () => {
    const languages = [{ _id: "lang-eng", languageCode: "eng" }] as any;

    it("links content to its editor in its language", () => {
        expect(cmsLink(content, "https://cms.test", languages)).toBe(
            "https://cms.test/post/edit/blog/p1/eng",
        );
    });

    it("links other types to their overview", () => {
        expect(cmsLink({ type: DocType.Redirect }, "https://cms.test", languages)).toBe(
            "https://cms.test/redirects",
        );
    });

    it("is empty without a CMS URL", () => {
        expect(cmsLink(content, undefined, languages)).toBe("");
    });
});

describe("cursors", () => {
    const schema = z.object({ ts: z.number(), ids: z.array(z.string()) });

    it("round-trips a cursor of the expected shape", () => {
        expect(decodeCursor(encodeCursor({ ts: 5, ids: ["a"] }), schema)).toEqual({
            ts: 5,
            ids: ["a"],
        });
    });

    it.each([
        ["garbage", "%%%"],
        ["another shape", encodeCursor({ ts: "x" })],
        ["a non-object", encodeCursor(5)],
    ])("rejects %s as an invalid cursor", (_name, cursor) => {
        expect(() => decodeCursor(cursor, schema)).toThrow("Invalid cursor");
    });
});
