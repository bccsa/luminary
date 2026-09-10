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

/**
 * Schedule an entry's expiry. The timer is unref'd where the runtime supports it (Node): a
 * ref'd timer holds the event loop open, so in a server-side render every compiled template
 * would keep the process alive for the whole expiry window. Browsers hand back a plain numeric
 * handle with no `unref`.
 */
function scheduleExpiry(key: string): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
        sharedCache.delete(key);
    }, CACHE_EXPIRY_MS);
    const handle = timer as unknown as { unref?: () => void };
    if (typeof handle?.unref === "function") handle.unref();
    return timer;
}

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
        entry.timer = scheduleExpiry(key);
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
    sharedCache.set(key, { value, timer: scheduleExpiry(key) });
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

// ============================================================================
// Template Persistence (localStorage)
// ============================================================================

/** localStorage key for persisted template data */
const STORAGE_KEY = "mango_tpl_cache";

/** Storage format version - bump to invalidate persisted data on schema changes */
const STORAGE_VERSION = 1;

/** Suppresses re-persistence during cache warmup to avoid redundant writes */
let _isWarming = false;

/** Pending templates to batch-flush to localStorage */
let _pendingTemplates: Array<[string, object]> | null = null;

/** Timer for debounced localStorage writes */
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Check if localStorage is available (not present in Node.js, Web Workers, etc.)
 */
function hasLocalStorage(): boolean {
    try {
        return typeof localStorage !== "undefined" && localStorage !== null;
    } catch {
        return false;
    }
}

/**
 * Whether templates may be persisted at all. Persistence is a browser concern: a server-side
 * render can be given a `localStorage` shim purely so this library imports, and writing there
 * only serialises templates into memory that dies with the process. Gates reads as well as
 * writes so warm-up never expects entries this environment refuses to store.
 */
function canPersistTemplates(): boolean {
    return import.meta.env?.SSR !== true && hasLocalStorage();
}

/**
 * Read all persisted template entries from localStorage.
 */
function readPersistedEntries(): Map<string, object> {
    const result = new Map<string, object>();

    if (!canPersistTemplates()) return result;

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return result;

        const data = JSON.parse(raw);
        if (!data || data.v !== STORAGE_VERSION || !Array.isArray(data.e)) {
            // Version mismatch or corrupt data - discard
            localStorage.removeItem(STORAGE_KEY);
            return result;
        }

        for (let i = 0; i < data.e.length; i++) {
            const entry = data.e[i];
            if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string") {
                result.set(entry[0], entry[1]);
            }
        }
    } catch {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
    }

    return result;
}

/**
 * Flush pending templates to localStorage.
 * Merges with any existing persisted entries.
 */
function flushPendingTemplates(): void {
    _flushTimer = null;
    if (!_pendingTemplates || _pendingTemplates.length === 0) return;

    try {
        const existing = readPersistedEntries();

        for (let i = 0; i < _pendingTemplates.length; i++) {
            existing.set(_pendingTemplates[i][0], _pendingTemplates[i][1]);
        }

        const entries: Array<[string, object]> = [];
        existing.forEach((template, key) => {
            entries.push([key, template]);
        });

        localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, e: entries }));
    } catch {
        // localStorage may be full or unavailable - silently fail
    }

    _pendingTemplates = null;
}

/**
 * Schedule a template to be persisted to localStorage.
 * Writes are debounced (200ms) to batch multiple saves into a single write.
 *
 * @param cacheKey - The cache key (including prefix)
 * @param template - The normalized template object (must be JSON-serializable)
 */
export function scheduleTemplatePersist(cacheKey: string, template: object): void {
    if (_isWarming || !canPersistTemplates()) return;

    if (!_pendingTemplates) _pendingTemplates = [];
    _pendingTemplates.push([cacheKey, template]);

    if (!_flushTimer) {
        _flushTimer = setTimeout(flushPendingTemplates, 200);
    }
}

/**
 * Get all persisted templates whose cache keys match a given prefix.
 *
 * @param prefix - The cache key prefix to filter by (e.g., "tp:", "td:")
 * @returns Map of cache key → template object
 */
export function getPersistedTemplates(prefix: string): Map<string, object> {
    const all = readPersistedEntries();
    const result = new Map<string, object>();

    all.forEach((template, key) => {
        if (key.startsWith(prefix)) {
            result.set(key, template);
        }
    });

    return result;
}

/**
 * Set the warming flag to suppress re-persistence during cache warmup.
 */
export function setWarmingFlag(warming: boolean): void {
    _isWarming = warming;
}

/**
 * Clear all persisted template data from localStorage and reset internal state.
 * Also cancels any pending debounced writes.
 */
export function clearPersistedTemplates(): void {
    if (_flushTimer) {
        clearTimeout(_flushTimer);
        _flushTimer = null;
    }
    _pendingTemplates = null;

    if (!hasLocalStorage()) return;
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}
