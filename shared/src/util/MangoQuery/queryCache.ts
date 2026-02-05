/**
 * Shared caching utilities for Mango query compilation.
 * Provides a single shared cache used by mangoCompile and mangoToDexie.
 *
 * Cache keys are prefixed to avoid collisions between different cache usages:
 * - "tp:" - template-based predicate cache (mangoCompile)
 * - "td:" - template-based Dexie analysis cache (mangoToDexie)
 */

// ============================================================================
// Configuration
// ============================================================================

/** Cache expiry time in milliseconds (5 minutes) */
export const CACHE_EXPIRY_MS = 5 * 60 * 1000;

// ============================================================================
// Shared Cache Instance
// ============================================================================

/** Cache entry with value and expiry timer */
interface CacheEntry {
    value: unknown;
    timer: ReturnType<typeof setTimeout>;
}

/** Single shared cache for all Mango query operations */
const sharedCache = new Map<string, CacheEntry>();

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Get a value from the shared cache.
 * Resets the expiry timer on cache hit.
 *
 * @param key - The cache key (should include prefix)
 * @returns The cached value or undefined if not found
 */
export function cacheGet<T>(key: string): T | undefined {
    const entry = sharedCache.get(key);
    if (entry) {
        // Reset expiry timer on access
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
            sharedCache.delete(key);
        }, CACHE_EXPIRY_MS);
        return entry.value as T;
    }
    return undefined;
}

/**
 * Add a value to the shared cache with an expiry timer.
 *
 * @param key - The cache key (should include prefix)
 * @param value - The value to cache
 */
export function cacheSet(key: string, value: unknown): void {
    // Clear existing entry if present
    const existing = sharedCache.get(key);
    if (existing) {
        clearTimeout(existing.timer);
    }

    // Create new entry with expiry timer
    const timer = setTimeout(() => {
        sharedCache.delete(key);
    }, CACHE_EXPIRY_MS);

    sharedCache.set(key, { value, timer });
}

/**
 * Clear all entries from the shared cache.
 * This clears ALL cached data (mangoCompile, mangoToDexie, etc.).
 */
export function clearAllMangoCache(): void {
    sharedCache.forEach((entry) => {
        clearTimeout(entry.timer);
    });
    sharedCache.clear();
}

/**
 * Clear cache entries matching a specific prefix.
 * Useful for clearing only mangoCompile or mangoToDexie caches.
 *
 * @param prefix - The prefix to match (e.g., "mc:", "dx:", "ex:")
 */
export function clearCacheByPrefix(prefix: string): void {
    const keysToDelete: string[] = [];
    sharedCache.forEach((entry, key) => {
        if (key.startsWith(prefix)) {
            clearTimeout(entry.timer);
            keysToDelete.push(key);
        }
    });
    for (let i = 0; i < keysToDelete.length; i++) {
        sharedCache.delete(keysToDelete[i]);
    }
}

/**
 * Get cache statistics for all entries or filtered by prefix.
 *
 * @param prefix - Optional prefix to filter stats (e.g., "mc:", "dx:")
 * @returns Object with size and keys
 */
export function getCacheStats(prefix?: string): { size: number; keys: string[] } {
    if (!prefix) {
        return {
            size: sharedCache.size,
            keys: Array.from(sharedCache.keys()),
        };
    }

    const filteredKeys: string[] = [];
    sharedCache.forEach((_, key) => {
        if (key.startsWith(prefix)) {
            filteredKeys.push(key);
        }
    });
    return {
        size: filteredKeys.length,
        keys: filteredKeys,
    };
}

// ============================================================================
// Cache Key Prefixes (exported for documentation/consistency)
// ============================================================================

/** Prefix for template-based predicate cache (mangoCompile) */
export const CACHE_PREFIX_TEMPLATE = "tp:";

/** Prefix for template-based Dexie analysis cache (mangoToDexie) */
export const CACHE_PREFIX_TEMPLATE_DEXIE = "td:";
