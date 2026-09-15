/** Compatibility exports over the synchronous response-cache adapter. */
import type { BaseDocumentDto } from "../../types";
import { createResponseCache } from "./cacheStorage";
import type { CachedWindow } from "./cacheCodec";
export { structuralCacheKey, omitFields } from "./cacheCodec";
export type { CachedWindow } from "./cacheCodec";

// Resolve storage at operation time: import remains safe before browser/shim setup.
const cache = createResponseCache(() => localStorage);
export function readResponseCache<T extends BaseDocumentDto>(
    key: string,
): CachedWindow<T> | undefined {
    return cache.read<T>(key);
}
export function writeResponseCache<T extends BaseDocumentDto>(
    key: string,
    window: CachedWindow<T>,
    maxDocs?: number,
    stripFields: readonly string[] = [],
): void {
    cache.write(key, window, maxDocs, stripFields);
}
export function clearResponseCache(): void {
    cache.clear();
}
