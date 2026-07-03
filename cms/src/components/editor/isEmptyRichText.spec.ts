import { describe, it, expect } from "vitest";
import { isEmptyRichText } from "./isEmptyRichText";

describe("isEmptyRichText", () => {
    it("treats absent / blank values as empty", () => {
        expect(isEmptyRichText(undefined)).toBe(true);
        expect(isEmptyRichText("")).toBe(true);
        expect(isEmptyRichText("   ")).toBe(true);
    });

    it("treats rte-vue's empty-document serialisations as empty", () => {
        expect(isEmptyRichText("<p></p>")).toBe(true);
        expect(isEmptyRichText("<p><br></p>")).toBe(true);
        expect(isEmptyRichText("<p><br /></p>")).toBe(true);
        expect(isEmptyRichText("<p>&nbsp;</p>")).toBe(true);
        expect(isEmptyRichText("  <p>   </p>  ")).toBe(true);
    });

    it("treats real text as non-empty", () => {
        expect(isEmptyRichText("<p>Hello</p>")).toBe(false);
        expect(isEmptyRichText("<p>a</p><p>b</p>")).toBe(false);
        expect(isEmptyRichText("<h2>Title</h2>")).toBe(false);
    });

    it("does not mistake non-text content for empty (no data loss)", () => {
        expect(isEmptyRichText('<img src="x.png">')).toBe(false);
        expect(isEmptyRichText("<hr>")).toBe(false);
        expect(isEmptyRichText("<p></p><img src='x.png'>")).toBe(false);
    });
});
