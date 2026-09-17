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
/**
 * Remove ALL persisted response-cache windows. Called when the local cache is cleared
 * (`db.purge`) so a later mount cannot seed a stale window from a now-purged dataset.
 * Best-effort; tolerates an unavailable storage provider.
 */
export function clearResponseCache(): void {
    cache.clear();
}
