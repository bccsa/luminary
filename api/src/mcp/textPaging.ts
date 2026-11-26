import { sanitizeContentText } from "../util/sanitizeContentText";

/** Largest text chunk returned in one tool result, in characters (not bytes). */
export const TEXT_CHUNK_CHARS = 20_000;

const VOID_TAGS = new Set(["br", "hr"]);

/**
 * Splits sanitized article HTML into its top-level parts (each block element with its content,
 * and any text between them). Relies on sanitizer output: well-formed, text escaped, so a raw
 * `<` only ever opens a tag and a raw `>` only ever closes one.
 */
export function splitTopLevel(html: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    let i = 0;

    while (i < html.length) {
        if (html[i] !== "<") {
            const next = html.indexOf("<", i);
            i = next === -1 ? html.length : next;
            if (depth === 0) {
                parts.push(html.slice(start, i));
                start = i;
            }
            continue;
        }

        const close = html.indexOf(">", i);
        const end = close === -1 ? html.length : close + 1;
        const tag = html.slice(i, end);
        const name = /^<\/?([a-zA-Z0-9]+)/.exec(tag)?.[1]?.toLowerCase();

        if (tag.startsWith("</")) depth = Math.max(0, depth - 1);
        else if (name && !VOID_TAGS.has(name) && !tag.endsWith("/>")) depth++;

        i = end;
        if (depth === 0) {
            parts.push(html.slice(start, i));
            start = i;
        }
    }
    if (start < html.length) parts.push(html.slice(start));
    return parts.filter((p) => p.length > 0);
}

/**
 * Splits article HTML into chunks of at most `limit` characters, only between top-level blocks,
 * so every chunk is valid HTML on its own. A single block larger than the limit is its own chunk.
 * Works on the sanitized form, so reads and chunk edits agree on the boundaries.
 */
export function chunkText(html: string | undefined, limit = TEXT_CHUNK_CHARS): string[] {
    const clean = sanitizeContentText(html ?? "") ?? "";
    if (clean.length <= limit) return [clean];

    const chunks: string[] = [];
    let current = "";
    for (const part of splitTopLevel(clean)) {
        if (current && current.length + part.length > limit) {
            chunks.push(current);
            current = "";
        }
        current += part;
    }
    if (current) chunks.push(current);
    return chunks;
}

/**
 * Replaces the given chunks of a paginated body and returns the new full text. Chunk boundaries
 * come from the stored body, so the caller must have checked it hasn't changed (the version).
 */
export function spliceChunks(
    storedHtml: string | undefined,
    edits: { index: number; html: string }[],
    limit = TEXT_CHUNK_CHARS,
): string {
    const chunks = chunkText(storedHtml, limit);
    for (const edit of edits) {
        if (!Number.isInteger(edit.index) || edit.index < 0 || edit.index >= chunks.length) {
            throw new Error(
                `Text chunk ${edit.index} does not exist (the body has ${chunks.length})`,
            );
        }
        chunks[edit.index] = edit.html;
    }
    return chunks.join("");
}
