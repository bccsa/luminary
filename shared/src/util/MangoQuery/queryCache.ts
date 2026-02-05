/**
 * Shared caching utilities for Mango query compilation.
 * Provides a single shared cache used by mangoCompile and mangoToDexie.
 *
 * Cache keys are prefixed to avoid collisions between different cache usages:
 * - "tp:" - template-based predicate cache (mangoCompile)
 * - "td:" - template-based Dexie analysis cache (mangoToDexie)
 * - "ex:" - expanded selector cache
 */

// ============================================================================
// Configuration
// ============================================================================

/** Cache expiry time in milliseconds (5 minutes) */
export const CACHE_EXPIRY_MS = 5 * 60 * 1000;

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Fast string hash using djb2 algorithm.
 * Produces a numeric hash that we convert to a base-36 string for compactness.
 */
export function hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    // Convert to unsigned 32-bit integer, then to base-36 string
    return (hash >>> 0).toString(36);
}

/**
 * Generate a cache key from an object (typically a MangoSelector or MangoQuery).
 * Uses JSON.stringify + fast hash for efficient key generation.
 *
 * IMPORTANT: The prefix parameter is required to namespace cache keys and prevent
 * collisions between different cache usages (e.g., mangoCompile vs mangoToDexie).
 *
 * Note: Different key orders in equivalent objects may produce different cache keys,
 * but this is acceptable as it only affects cache efficiency, not correctness.
 *
 * @param obj - The object to generate a cache key for
 * @param prefix - Required prefix to namespace the cache key (e.g., "mc", "dx", "ex")
 * @returns A compact string cache key with prefix
 */
export function generateCacheKey(obj: unknown, prefix: string): string {
    const hash = hashString(JSON.stringify(obj));
    return `${prefix}:${hash}`;
}

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
 * Check if a key exists in the cache.
 *
 * @param key - The cache key (should include prefix)
 */
export function cacheHas(key: string): boolean {
    return sharedCache.has(key);
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

/** Prefix for expanded selector cache */
export const CACHE_PREFIX_EXPAND = "ex:";

/** Prefix for template-based predicate cache (mangoCompile) */
export const CACHE_PREFIX_TEMPLATE = "tp:";

/** Prefix for template-based Dexie analysis cache (mangoToDexie) */
export const CACHE_PREFIX_TEMPLATE_DEXIE = "td:";
