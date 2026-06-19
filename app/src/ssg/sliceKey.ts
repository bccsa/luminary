import type { MangoSelector } from "luminary-shared";

/**
 * Deterministic key for a snapshot slice (a prerendered query result). It must be
 * IDENTICAL when computed at build (Node) and on the client, so hydration seeds
 * from the right slice.
 *
 * It hashes ONLY the CALLER's selector clauses + sort/limit/use_index + the render
 * language — NOT the `mangoIsPublished` clause, whose `sessionNow()` bound differs
 * between the Node build and the client page load and would otherwise change the
 * hash. The caller clauses (incl. reactive `$in` lists) are deterministic given the
 * same seeded inputs, so build and client agree.
 */
export function sliceKey(
    callerSelector: MangoSelector[],
    opts: { sort?: unknown; limit?: unknown; useIndex?: string },
    lang: string,
): string {
    const canonical = stableStringify({
        s: callerSelector,
        sort: opts.sort ?? null,
        limit: opts.limit ?? null,
        idx: opts.useIndex ?? null,
        lang,
    });
    return djb2(canonical);
}

/** JSON with object keys sorted recursively, so equal data hashes equal. */
function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const obj = value as Record<string, unknown>;
    const body = Object.keys(obj)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
        .join(",");
    return `{${body}}`;
}

/** DJB2 string hash → short hex (collision-safe enough for slice identity). */
function djb2(str: string): string {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}
