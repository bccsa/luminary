/**
 * Cached Mango query compiler.
 * This module provides the main mangoCompile function with automatic caching.
 * For the internal compilation logic, see ./compileSelector.ts
 */

import type { MangoSelector } from "./MangoTypes";
import { compileSelector, type Predicate } from "./compileSelector";
import {
    generateCacheKey,
    cacheGet,
    cacheSet,
    clearCacheByPrefix,
    getCacheStats,
    CACHE_PREFIX_COMPILE,
} from "./queryCache";

// Re-export Predicate type for convenience
export type { Predicate } from "./compileSelector";

// ============================================================================
// Cache Management Exports
// ============================================================================

/**
 * Clear all cached compiled queries (mangoCompile only).
 * Does not affect mangoToDexie cache.
 * For clearing all Mango caches, use clearAllMangoCache() from queryCache.
 */
export function clearMangoCache(): void {
    clearCacheByPrefix(CACHE_PREFIX_COMPILE);
}

/**
 * Get cache statistics for mangoCompile.
 */
export function getMangoCacheStats(): { size: number; keys: string[] } {
    return getCacheStats(CACHE_PREFIX_COMPILE);
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Compile a Mango query into a filter function.
 *
 * Compiled predicates are cached based on the query structure. Cached entries
 * expire after 5 minutes of non-use (timer resets on each access).
 *
 * The same query used in mangoToDexie will have a different cache entry
 * (different prefix) to avoid conflicts between predicate and analysis caches.
 *
 * @param q - The Mango query selector to compile
 * @returns A predicate function that returns true if a document matches the query
 */
export function mangoCompile(q: MangoSelector): Predicate {
    // Handle invalid query (not cacheable)
    if (q === null || typeof q !== "object") {
        return () => false;
    }

    // Handle empty query (not cacheable, just return constant)
    let hasKeys = false;
    for (const _ in q) {
        hasKeys = true;
        break;
    }
    if (!hasKeys) {
        return () => true;
    }

    // Generate cache key with mangoCompile prefix
    const cacheKey = generateCacheKey(q, CACHE_PREFIX_COMPILE);

    // Check cache
    const cached = cacheGet<Predicate>(cacheKey);
    if (cached) {
        return cached;
    }

    // Cache miss - compile the query using the cached mangoCompile for sub-selectors
    const predicate = compileSelector(q, mangoCompile);

    // Add to cache with expiry timer
    cacheSet(cacheKey, predicate);

    return predicate;
}
