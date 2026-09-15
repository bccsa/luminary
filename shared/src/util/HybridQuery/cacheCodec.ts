/** Internal, storage-independent response-cache wire contract. */
import { normalizeSelector, hashString } from "../MangoQuery/templateNormalize";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import type { BaseDocumentDto } from "../../types";

export const STORAGE_PREFIX = "hqcache:";
export const DEFAULT_MAX_DOCS = 500;
export interface CachedWindow<T extends BaseDocumentDto> {
    local: T[];
    remote: T[];
}

export function structuralCacheKey(query: MangoQuery, cacheId?: string): string {
    const { template } = normalizeSelector(query.selector);
    const skeleton = JSON.stringify({
        t: template,
        s: query.$sort ?? null,
        l: query.$limit ?? null,
        i: query.use_index ?? null,
        c: cacheId ?? null,
    });
    return hashString(skeleton);
}

export function omitFields<T extends BaseDocumentDto>(doc: T, fields: readonly string[]): T {
    if (!fields.length) return doc;
    let copy: Record<string, unknown> | undefined;
    for (const f of fields) {
        if (f in doc) {
            copy ??= { ...doc };
            delete copy[f];
        }
    }
    return (copy as T | undefined) ?? doc;
}

export function encodeWindow<T extends BaseDocumentDto>(
    window: CachedWindow<T>,
    maxDocs: number | undefined = DEFAULT_MAX_DOCS,
    stripFields: readonly string[] = [],
): string {
    const cap = maxDocs ?? DEFAULT_MAX_DOCS;
    const local = window.local.length > cap ? window.local.slice(0, cap) : window.local;
    const remoteBudget = Math.max(0, cap - local.length);
    const remote =
        window.remote.length > remoteBudget ? window.remote.slice(0, remoteBudget) : window.remote;
    const payload = {
        local: stripFields.length ? local.map((d) => omitFields(d, stripFields)) : local,
        remote: stripFields.length ? remote.map((d) => omitFields(d, stripFields)) : remote,
    };
    return JSON.stringify(payload);
}

export function decodeWindow<T extends BaseDocumentDto>(
    raw: string | null,
): CachedWindow<T> | undefined {
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray(parsed.local) ||
        !Array.isArray(parsed.remote)
    )
        return undefined;
    if (!parsed.local.length && !parsed.remote.length) return undefined;
    return parsed as CachedWindow<T>;
}
