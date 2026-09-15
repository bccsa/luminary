import type { BaseDocumentDto } from "../../types";
import { decodeWindow, encodeWindow, STORAGE_PREFIX, type CachedWindow } from "./cacheCodec";

/** The storage capability is synchronous; callers may supply an in-memory store. */
export interface CacheStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    readonly length: number;
    key(index: number): string | null;
}

export function createResponseCache(storage: () => CacheStorage) {
    return {
        read<T extends BaseDocumentDto>(key: string): CachedWindow<T> | undefined {
            try {
                return decodeWindow<T>(storage().getItem(STORAGE_PREFIX + key));
            } catch {
                return undefined;
            }
        },
        write<T extends BaseDocumentDto>(
            key: string,
            window: CachedWindow<T>,
            maxDocs?: number,
            stripFields: readonly string[] = [],
        ): void {
            try {
                storage().setItem(STORAGE_PREFIX + key, encodeWindow(window, maxDocs, stripFields));
            } catch {
                try {
                    storage().removeItem(STORAGE_PREFIX + key);
                } catch {
                    /* unavailable storage */
                }
            }
        },
        clear(): void {
            try {
                const store = storage();
                const keys: string[] = [];
                for (let i = 0; i < store.length; i++) {
                    const key = store.key(i);
                    if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
                }
                keys.forEach((key) => store.removeItem(key));
            } catch {
                /* best-effort cache purge */
            }
        },
    };
}
