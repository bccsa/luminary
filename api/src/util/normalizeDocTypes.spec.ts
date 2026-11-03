import { DocType } from "../enums";
import { normalizeDocTypes } from "./normalizeDocTypes";

describe("normalizeDocTypes", () => {
    it("keeps valid doc types and removes duplicates", () => {
        expect(normalizeDocTypes([DocType.Post, DocType.Post, DocType.Tag])).toEqual([
            DocType.Post,
            DocType.Tag,
        ]);
    });

    it("drops unknown and non-string entries", () => {
        expect(normalizeDocTypes(["nope", 5, null, {}, DocType.Content])).toEqual([
            DocType.Content,
        ]);
    });

    it("returns an empty list for non-array input", () => {
        expect(normalizeDocTypes(undefined)).toEqual([]);
        expect(normalizeDocTypes("post")).toEqual([]);
        expect(normalizeDocTypes({ length: 3 })).toEqual([]);
    });

    it("does not look past the number of real doc types", () => {
        const payload = [...Array(1_000_000).fill("junk"), DocType.Post];
        expect(normalizeDocTypes(payload)).toEqual([]);
    });
});
