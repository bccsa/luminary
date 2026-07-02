import { DocType, type BaseDocumentDto, type ContentDto } from "../types";

const MIN_WORD_LEN = 3;

function queryWords(query: string): string[] {
    return query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= MIN_WORD_LEN);
}

function allWordsMatchFields(words: string[], fields: (string | null | undefined)[]): boolean {
    if (!words.length) return false;
    const haystacks = fields.map((f) => (f ?? "").toLowerCase());
    return words.every((word) => haystacks.some((field) => field.includes(word)));
}

export type FtsMightMatchOptions = {
    /** When false (fuzzy/content related mode), any doc of the type may match. Default true. */
    strict?: boolean;
};

/**
 * Cheap client pre-check: could this doc plausibly appear in the current FTS query?
 * Mirrors server strict field rules (User name/email, Redirect slug/toSlug, Content title/author).
 */
export function ftsMightMatchQuery(
    query: string,
    docType: DocType,
    doc: Partial<BaseDocumentDto>,
    options: FtsMightMatchOptions = {},
): boolean {
    const strict = options.strict ?? true;
    const words = queryWords(query);
    if (!words.length || doc.type !== docType) return false;

    if (docType === DocType.Content && !strict) return true;

    if (docType === DocType.User) {
        const u = doc as { name?: string; email?: string };
        return allWordsMatchFields(words, [u.name, u.email]);
    }

    if (docType === DocType.Redirect) {
        const r = doc as { slug?: string; toSlug?: string };
        return allWordsMatchFields(words, [r.slug, r.toSlug]);
    }

    if (docType === DocType.Content) {
        const c = doc as ContentDto;
        return allWordsMatchFields(words, [c.title, c.author]);
    }

    return false;
}
