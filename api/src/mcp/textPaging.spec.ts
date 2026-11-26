import { sanitizeContentText } from "../util/sanitizeContentText";
import { chunkText, spliceChunks, splitTopLevel } from "./textPaging";

const paragraph = (n: number, len = 50) =>
    `<p>${String(n).padStart(3, "0")} ${"x".repeat(len)}</p>`;

describe("splitTopLevel", () => {
    it("splits on top-level blocks and keeps nested content together", () => {
        const html =
            "<h2>Title</h2><p>One <strong>bold</strong> &lt;not a tag&gt;</p><ul><li>a</li><li>b</li></ul><hr><p>Two</p>";
        expect(splitTopLevel(html)).toEqual([
            "<h2>Title</h2>",
            "<p>One <strong>bold</strong> &lt;not a tag&gt;</p>",
            "<ul><li>a</li><li>b</li></ul>",
            "<hr>",
            "<p>Two</p>",
        ]);
    });

    it("keeps top-level text and void tags as their own parts", () => {
        expect(splitTopLevel("text<br><p>p</p>tail")).toEqual(["text", "<br>", "<p>p</p>", "tail"]);
    });

    it("keeps attributes containing escaped characters inside their tag", () => {
        const html = '<p><a href="https://x.test/?a=1&amp;b=2" target="_blank">l</a></p><p>n</p>';
        expect(splitTopLevel(html)).toEqual([
            '<p><a href="https://x.test/?a=1&amp;b=2" target="_blank">l</a></p>',
            "<p>n</p>",
        ]);
    });
});

describe("chunkText", () => {
    it("returns the whole body as one chunk when it fits", () => {
        expect(chunkText("<p>short</p>")).toEqual(["<p>short</p>"]);
    });

    it("returns one empty chunk for an empty body", () => {
        expect(chunkText(undefined)).toEqual([""]);
    });

    it("splits a long body only between blocks, every chunk valid on its own", () => {
        const html = Array.from({ length: 40 }, (_, i) => paragraph(i)).join("");
        const chunks = chunkText(html, 300);

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.join("")).toBe(sanitizeContentText(html));
        for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(300);
            // A split inside an element would make the sanitizer close or drop tags.
            expect(sanitizeContentText(chunk)).toBe(chunk);
        }
    });

    it("keeps a block larger than the limit as its own chunk", () => {
        const html = paragraph(1, 10) + paragraph(2, 500) + paragraph(3, 10);
        const chunks = chunkText(html, 100);

        expect(chunks).toEqual([paragraph(1, 10), paragraph(2, 500), paragraph(3, 10)]);
    });

    it("counts characters, not bytes", () => {
        const amharic = `<p>${"ሀ".repeat(90)}</p>`; // 3 bytes per character in UTF-8
        expect(chunkText(amharic + amharic, 200)).toHaveLength(1);
    });

    it("chunks the sanitized form of the stored body", () => {
        const html = `<p>a</p><script>alert(1)</script>${paragraph(1, 200)}`;
        expect(chunkText(html, 100).join("")).toBe(sanitizeContentText(html));
    });
});

describe("spliceChunks", () => {
    const html = Array.from({ length: 10 }, (_, i) => paragraph(i)).join("");

    it("replaces only the given chunks", () => {
        const chunks = chunkText(html, 200);
        const result = spliceChunks(html, [{ index: 1, html: "<p>new</p>" }], 200);

        expect(result).toBe([chunks[0], "<p>new</p>", ...chunks.slice(2)].join(""));
    });

    it("rejects an index outside the body", () => {
        expect(() => spliceChunks(html, [{ index: 99, html: "<p>x</p>" }], 200)).toThrow(
            "Text chunk 99 does not exist",
        );
    });
});
