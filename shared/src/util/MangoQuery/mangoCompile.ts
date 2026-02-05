/**
 * Cached Mango query compiler with template-based caching.
 *
 * This module provides the main mangoCompile function with automatic caching.
 * It uses template-based caching where the query structure is normalized
 * (values extracted), allowing the same compiled logic to be reused with
 * different parameter values.
 *
 * For example, queries like:
 * - `{ type: "post", status: "published" }`
 * - `{ type: "page", status: "draft" }`
 *
 * Share the same template structure `{ type: $0, status: $1 }` and can reuse
 * the same compiled predicate with different bound values.
 */

import type { MangoSelector } from "./MangoTypes";
import type { Predicate } from "./compileSelector";
import { normalizeSelector, generateTemplateKey } from "./templateNormalize";
import {
    compileTemplateSelector,
    type ParameterizedPredicate,
} from "./compileTemplateSelector";
import {
    cacheGet,
    cacheSet,
    clearCacheByPrefix,
    getCacheStats,
    CACHE_PREFIX_TEMPLATE,
} from "./queryCache";

// Re-export Predicate type for convenience
export type { Predicate };

// ============================================================================
// Cache Management Exports
// ============================================================================

/**
 * Clear all cached compiled queries.
 * Does not affect mangoToDexie cache.
 * For clearing all Mango caches, use clearAllMangoCache() from queryCache.
 */
export function clearMangoCache(): void {
    clearCacheByPrefix(CACHE_PREFIX_TEMPLATE);
}

/**
 * Get cache statistics for mangoCompile.
 */
export function getMangoCacheStats(): { size: number; keys: string[] } {
    return getCacheStats(CACHE_PREFIX_TEMPLATE);
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Compile a Mango query into a filter function.
 *
 * Uses template-based caching: the query structure is normalized by extracting
 * values, and the compiled predicate is cached based on the structure alone.
 * This allows queries with the same structure but different values to share
 * the same compiled logic.
 *
 * For example:
 * - `{ type: "post", status: "published" }`
 * - `{ type: "page", status: "draft" }`
 *
 * Both normalize to the same template structure and share the compiled predicate.
 * Only the values are bound differently at runtime.
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

    // Normalize the selector into a template and extract values
    const { template, values } = normalizeSelector(q);

    // Generate cache key from template structure (not values)
    const cacheKey = generateTemplateKey(template, CACHE_PREFIX_TEMPLATE);

    // Check cache for compiled template
    const cached = cacheGet<ParameterizedPredicate>(cacheKey);
    
    if (cached) {
        // Cache hit - return bound predicate with cached template
        return (doc: any) => cached(doc, values);
    }

    // Cache miss - compile the template and cache it
    const compiledTemplate = compileTemplateSelector(template);
    cacheSet(cacheKey, compiledTemplate);

    // Return a bound predicate that captures the extracted values
    // This is a cheap closure creation - the expensive compilation is cached
    return (doc: any) => compiledTemplate(doc, values);
}
