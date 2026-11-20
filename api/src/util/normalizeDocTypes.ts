import { DocType } from "../enums";

const VALID_DOC_TYPES = new Set<string>(Object.values(DocType));

/** Reduces a client-supplied doc type list to unique, valid DocTypes, capped at the number of real types. */
export function normalizeDocTypes(input: unknown): DocType[] {
    if (!Array.isArray(input)) return [];

    const result = new Set<DocType>();
    // Slice first so an oversized payload costs O(cap), not O(payload)
    for (const value of input.slice(0, VALID_DOC_TYPES.size)) {
        if (typeof value === "string" && VALID_DOC_TYPES.has(value)) result.add(value as DocType);
    }
    return [...result];
}
