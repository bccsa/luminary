import { describe, it, expect } from "vitest";
import formatPastedHtml from "./formatPastedHtml";

describe("formatPastedHtml", () => {
    it("removes line breaks and special characters", () => {
        const html = "Line1\nLine2\r\nLine3\u2028Line4\u2029Line5";
        const formatted = formatPastedHtml(html);
        expect(formatted).toBe("Line1 Line2 Line3 Line4 Line5");
    });

    it("removes soft hyphens", () => {
        const html = "text\u00ADwith\u00ADhyphens";
        const formatted = formatPastedHtml(html);
        expect(formatted).toBe("textwithhyphens");
    });

    it("removes spaces between tags", () => {
        const html = "<div> <p> text </p> </div>";
        const formatted = formatPastedHtml(html);
        expect(formatted).toBe("<div><p> text </p></div>");
    });

    it("removes standalone <br> tags", () => {
        const html = "<p>text</p><br/><p>more text</p>";
        const formatted = formatPastedHtml(html);
        expect(formatted).toBe("<p>text</p><p>more text</p>");
    });

    it("removes empty paragraphs", () => {
        const html = "<p>text</p><p>  </p><p>more text</p>";
        const formatted = formatPastedHtml(html);
        expect(formatted).toBe("<p>text</p><p>more text</p>");
    });

    it("converts non-breaking spaces to regular spaces", () => {
        const html = "<p>text&nbsp;with&nbsp;spaces</p>";
        const formatted = formatPastedHtml(html);
        expect(formatted).toBe("<p>text with spaces</p>");
    });

    it("demotes headings when h1 is present", () => {
        const html = "<h1>Title</h1><h2>Subtitle</h2><h5>Small</h5>";
        const formatted = formatPastedHtml(html);
        expect(formatted).toBe("<h2>Title</h2><h3>Subtitle</h3><p>Small</p>");
    });

    it("does not demote headings when h1 is not present", () => {
        const html = "<h2>Title</h2><h3>Subtitle</h3>";
        const formatted = formatPastedHtml(html);
        expect(formatted).toBe("<h2>Title</h2><h3>Subtitle</h3>");
    });

    it("converts unsupported heading levels (h6+) to paragraphs", () => {
        const html = "<h6>Heading 6</h6><h7>Heading 7</h7><h10>Heading 10</h10>";
        const formatted = formatPastedHtml(html);
        expect(formatted).toBe("<p>Heading 6</p><p>Heading 7</p><p>Heading 10</p>");
    });

    it("handles a complex case with multiple transformations", () => {
        const html = `
      <h1>Main Title</h1>
      <p>Paragraph with\nline break</p>
      <h2>Subtitle</h2>
      <p>&nbsp;Spaced&nbsp;text&nbsp;</p>
      <br/>
      <h7>Invalid heading</h7>
      <p>  </p>
    `;
        const formatted = formatPastedHtml(html);
        expect(formatted.trim()).toBe(
            "<h2>Main Title</h2><p>Paragraph with line break</p><h3>Subtitle</h3><p> Spaced text </p><p>Invalid heading</p>",
        );
    });
});
