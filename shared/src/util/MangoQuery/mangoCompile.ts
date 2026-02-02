/**
 * Cached Mango query compiler.
 * This module provides the main mangoCompile function with automatic caching.
 * For the internal compilation logic, see ./compileSelector.ts
 */

import type { MangoSelector } from "./MangoTypes";
import { compileSelector, type Predicate } from "./compileSelector";

// Re-export Predicate type for convenience
export type { Predicate } from "./compileSelector";

// ============================================================================
// Query Cache Configuration
// ============================================================================

/** Cache expiry time in milliseconds (5 minutes) */
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

// ============================================================================
// Cache Storage
// ============================================================================

/** Cache entry with predicate and expiry timer */
interface CacheEntry {
    predicate: Predicate;
    timer: ReturnType<typeof setTimeout>;
}

/** Cache storage for compiled query predicates */
const queryCache = new Map<string, CacheEntry>();

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Fast string hash using djb2 algorithm.
 * Produces a numeric hash that we convert to a base-36 string for compactness.
 */
function hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    // Convert to unsigned 32-bit integer, then to base-36 string
    return (hash >>> 0).toString(36);
}

/**
 * Generate a cache key from a query selector.
 * Uses JSON.stringify + fast hash for efficient key generation.
 * Note: Different key orders in equivalent queries may produce different cache keys,
 * but this is acceptable as it only affects cache efficiency, not correctness.
 */
function generateCacheKey(query: MangoSelector): string {
    return hashString(JSON.stringify(query));
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Reset the expiry timer for a cache entry.
 * Called on cache hits to extend the entry's lifetime.
 */
function resetExpiryTimer(key: string): void {
    const entry = queryCache.get(key);
    if (entry) {
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
            queryCache.delete(key);
        }, CACHE_EXPIRY_MS);
    }
}

/**
 * Add a compiled predicate to the cache with an expiry timer.
 */
function addToCache(key: string, predicate: Predicate): void {
    // Clear existing entry if present
    const existing = queryCache.get(key);
    if (existing) {
        clearTimeout(existing.timer);
    }

    // Create new entry with expiry timer
    const timer = setTimeout(() => {
        queryCache.delete(key);
    }, CACHE_EXPIRY_MS);

    queryCache.set(key, { predicate, timer });
}

/**
 * Clear all cached compiled queries.
 * Useful for memory management or when query patterns change significantly.
 */
export function clearMangoCache(): void {
    for (const entry of queryCache.values()) {
        clearTimeout(entry.timer);
    }
    queryCache.clear();
}

/**
 * Get cache statistics for monitoring.
 */
export function getMangoCacheStats(): { size: number; keys: string[] } {
    return {
        size: queryCache.size,
        keys: Array.from(queryCache.keys()),
    };
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
 * @param q - The Mango query selector to compile
 * @returns A predicate function that returns true if a document matches the query
 */
export function mangoCompile(q: MangoSelector): Predicate {
    // Handle invalid query (not cacheable)
    if (q === null || typeof q !== "object") {
        return () => false;
    }

    // Handle empty query (not cacheable, just return constant)
    const keys = Object.keys(q);
    if (keys.length === 0) {
        return () => true;
    }

    // Generate cache key
    const cacheKey = generateCacheKey(q);

    // Check cache
    const cached = queryCache.get(cacheKey);
    if (cached) {
        // Cache hit - reset expiry timer and return cached predicate
        resetExpiryTimer(cacheKey);
        return cached.predicate;
    }

    // Cache miss - compile the query using the cached mangoCompile for sub-selectors
    const predicate = compileSelector(q, mangoCompile);

    // Add to cache with expiry timer
    addToCache(cacheKey, predicate);

    return predicate;
}
