import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { buildSearchHighlight } from "../searchHighlight";
import type { ContentDto } from "luminary-shared";

const doc = (overrides: Partial<ContentDto> = {}): Partial<ContentDto> => ({
    title: "The Quick Brown Fox",
    author: "Jane Doe",
    summary: "A short note about the quick brown fox jumping over things.",
    text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The quick brown fox ran across the meadow at dawn."}]}]}',
    ...overrides,
});

describe("buildSearchHighlight", () => {
    it("wraps matched query terms in <mark> in the title (preserving case)", () => {
        const { titleHtml } = buildSearchHighlight(doc(), "brown");
        expect(titleHtml).toContain("<mark>Brown</mark>");
        expect(titleHtml).toContain("The Quick");
    });

    it("builds a snippet from the body when terms match", () => {
        const { snippetHtml } = buildSearchHighlight(doc(), "meadow");
        expect(snippetHtml).toBeDefined();
        expect(snippetHtml).toContain("<mark>meadow</mark>");
    });

    it("highlights the author when present and matching", () => {
        const { authorHtml } = buildSearchHighlight(doc(), "jane");
        expect(authorHtml).toBeDefined();
        expect(authorHtml).toContain("<mark>Jane</mark>");
    });

    it("returns undefined snippet when there is no body text to excerpt", () => {
        const { snippetHtml } = buildSearchHighlight(doc({ summary: "", text: "" }), "fox");
        expect(snippetHtml).toBeUndefined();
    });

    it("falls back to a leading excerpt when the query does not match the body", () => {
        // No body match → show some context anyway (first part of the summary).
        const { snippetHtml } = buildSearchHighlight(doc(), "zzzznomatch");
        expect(snippetHtml).toBeDefined();
        expect(snippetHtml).not.toContain("<mark>");
    });

    it("returns no author highlight when the doc has no author", () => {
        const { authorHtml } = buildSearchHighlight(doc({ author: undefined }), "fox");
        expect(authorHtml).toBeUndefined();
    });

    it("strips HTML tags from the title and escapes special characters", () => {
        // Titles are stripped of HTML; surviving special chars are escaped, so no raw
        // markup is ever emitted (only the injected <mark>).
        const stripped = buildSearchHighlight(doc({ title: "<script>alert('x')</script> fox" }), "fox");
        expect(stripped.titleHtml).not.toContain("<script>");
        expect(stripped.titleHtml).toContain("<mark>fox</mark>");

        const escaped = buildSearchHighlight(doc({ title: "Tom & Jerry fox" }), "fox");
        expect(escaped.titleHtml).toContain("&amp;");
        expect(escaped.titleHtml).toContain("<mark>fox</mark>");
    });

    it("returns the (escaped) title and no snippet for an empty query", () => {
        const result = buildSearchHighlight(doc(), "");
        expect(result.titleHtml).toBe("The Quick Brown Fox");
        expect(result.snippetHtml).toBeUndefined();
    });
});
