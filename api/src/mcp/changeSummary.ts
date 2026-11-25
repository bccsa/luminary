/**
 * Builds the text a user confirms before a change to live content. Every value from a document
 * or from the model goes through {@link quote}, so it can't add wording or structure of its own.
 */

/** Longest value shown in a confirmation. */
const MAX_VALUE = 120;
/** Most change lines shown; the rest are counted. */
const MAX_LINES = 12;
/** Characters of unchanged text shown before the first difference in a body. */
const CONTEXT = 30;

/** Control, zero-width and bidi-control characters, which could restructure or disguise text. */
function isUnsafe(code: number): boolean {
    return (
        code < 0x20 ||
        (code >= 0x7f && code <= 0x9f) ||
        (code >= 0x200b && code <= 0x200f) ||
        (code >= 0x2028 && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069) ||
        code === 0xfeff
    );
}

/** Untrusted text as one bounded, quoted line. */
export function quote(value: unknown, max = MAX_VALUE): string {
    if (value === undefined || value === null || value === "") return "(empty)";
    const text = Array.from(String(value), (ch) => (isUnsafe(ch.codePointAt(0)) ? " " : ch))
        .join("")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/"/g, "'");
    return `"${text.length > max ? `${text.slice(0, max)}…` : text}"`;
}

function show(value: unknown): string {
    if (typeof value === "boolean") return value ? "on" : "off";
    if (typeof value === "number") return String(value);
    return quote(value);
}

/** One line per field whose value differs: `field: old → new`, or `field: value` for a new doc. */
export function fieldChanges(
    before: Record<string, any> | undefined,
    after: Record<string, any>,
    fields: string[],
    defaults: Record<string, unknown> = {},
): string[] {
    const lines: string[] = [];
    for (const field of fields) {
        const next = after[field] ?? defaults[field];
        if (!before) {
            if (next !== undefined && next !== "") lines.push(`${field}: ${show(next)}`);
            continue;
        }
        const prev = before[field] ?? defaults[field];
        if (JSON.stringify(prev) !== JSON.stringify(next))
            lines.push(`${field}: ${show(prev)} → ${show(next)}`);
    }
    return lines;
}

/** The ids added to and removed from a list, shown by name where one is known. */
export function listChange(
    label: string,
    before: string[] | undefined,
    after: string[] | undefined,
    names: Map<string, string> = new Map(),
): string[] {
    const prev = before ?? [];
    const next = after ?? [];
    const name = (id: string) => quote(names.get(id) ?? id);
    const added = next.filter((id) => !prev.includes(id)).map(name);
    const removed = prev.filter((id) => !next.includes(id)).map(name);
    if (!added.length && !removed.length) return [];
    const parts = [
        ...(added.length ? [`added ${added.join(", ")}`] : []),
        ...(removed.length ? [`removed ${removed.join(", ")}`] : []),
    ];
    return [`${label}: ${parts.join("; ")}`];
}

function plainText(html: string | undefined): string {
    return (html ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** How an HTML body changes: its size, and the wording around the first difference. */
export function textChange(
    beforeHtml: string | undefined,
    afterHtml: string | undefined,
): string[] {
    if ((beforeHtml ?? "") === (afterHtml ?? "")) return [];
    const prev = plainText(beforeHtml);
    const next = plainText(afterHtml);
    if (prev === next) return ["text: formatting only, no wording changed"];

    let start = 0;
    while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
    let end = 0;
    while (
        end < prev.length - start &&
        end < next.length - start &&
        prev[prev.length - 1 - end] === next[next.length - 1 - end]
    )
        end++;

    // Widen the changed region to whole words, so the excerpts don't start or end mid-word.
    const inWord = (text: string, i: number) => i >= 0 && i < text.length && /\S/.test(text[i]);
    while (start > 0 && inWord(prev, start - 1) && (inWord(prev, start) || inWord(next, start)))
        start--;
    while (
        end > 0 &&
        inWord(prev, prev.length - end) &&
        (inWord(prev, prev.length - end - 1) || inWord(next, next.length - end - 1))
    )
        end--;

    const from = Math.max(0, start - CONTEXT);
    const excerpt = (text: string) => {
        const changed = text.slice(from, text.length - end);
        return quote((from > 0 ? "…" : "") + changed + (end > 0 ? "…" : ""), MAX_VALUE + CONTEXT);
    };
    return [
        `text: ${prev.length} → ${next.length} characters. Was ${excerpt(prev)}, now ${excerpt(next)}`,
    ];
}

/** The confirmation text: a heading, the changes as a list, then any notes. */
export function confirmation(heading: string, changes: string[], notes: string[] = []): string {
    const shown = changes.slice(0, MAX_LINES).map((line) => `- ${line}`);
    if (changes.length > MAX_LINES) shown.push(`- and ${changes.length - MAX_LINES} more changes`);
    if (!changes.length) shown.push("- no changes");
    return [heading, ...shown, ...notes].join("\n");
}
