import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
    cacheGet,
    cacheSet,
    clearAllMangoCache,
    clearCacheByPrefix,
    getCacheStats,
    CACHE_EXPIRY_MS,
    CACHE_PREFIX_TEMPLATE,
    CACHE_PREFIX_TEMPLATE_DEXIE,
    scheduleTemplatePersist,
    getPersistedTemplates,
    clearPersistedTemplates,
    setWarmingFlag,
} from "./queryCache";

describe("queryCache", () => {
    beforeEach(() => {
        // Clear all cache entries before each test
        clearAllMangoCache();
    });

    afterEach(() => {
        // Clean up any fake timers
        vi.useRealTimers();
    });

    // ============================================
    // Basic cache operations (cacheGet, cacheSet)
    // ============================================

    describe("cacheGet / cacheSet", () => {
        it("cacheSet stores a value and cacheGet retrieves it", () => {
            cacheSet("test:key1", "value1");
            expect(cacheGet("test:key1")).toBe("value1");
        });

        it("cacheGet returns undefined for missing keys", () => {
            expect(cacheGet("nonexistent")).toBeUndefined();
        });

        it("cacheSet overwrites existing values", () => {
            cacheSet("test:key", "original");
            cacheSet("test:key", "updated");
            expect(cacheGet("test:key")).toBe("updated");
        });

        it("cacheSet stores different types of values", () => {
            cacheSet("test:string", "hello");
            cacheSet("test:number", 42);
            cacheSet("test:boolean", true);
            cacheSet("test:null", null);
            cacheSet("test:object", { a: 1, b: 2 });
            cacheSet("test:array", [1, 2, 3]);
            cacheSet("test:function", () => "fn");

            expect(cacheGet("test:string")).toBe("hello");
            expect(cacheGet("test:number")).toBe(42);
            expect(cacheGet("test:boolean")).toBe(true);
            expect(cacheGet("test:null")).toBe(null);
            expect(cacheGet("test:object")).toEqual({ a: 1, b: 2 });
            expect(cacheGet("test:array")).toEqual([1, 2, 3]);
            expect(typeof cacheGet("test:function")).toBe("function");
        });

        it("cacheGet with type parameter returns typed value", () => {
            cacheSet("test:typed", { name: "Alice", age: 30 });
            const result = cacheGet<{ name: string; age: number }>("test:typed");
            expect(result?.name).toBe("Alice");
            expect(result?.age).toBe(30);
        });
    });

    // ============================================
    // Cache expiry behavior
    // ============================================

    describe("cache expiry", () => {
        it("cache entries expire after CACHE_EXPIRY_MS", () => {
            vi.useFakeTimers();

            cacheSet("test:expiring", "value");
            expect(cacheGet("test:expiring")).toBe("value");

            // Advance time just before expiry
            vi.advanceTimersByTime(CACHE_EXPIRY_MS - 1);
            expect(cacheGet("test:expiring")).toBe("value");

            // Advance time past expiry (need to account for timer reset on previous get)
            vi.advanceTimersByTime(CACHE_EXPIRY_MS + 1);
            expect(cacheGet("test:expiring")).toBeUndefined();
        });

        it("cacheGet resets the expiry timer", () => {
            vi.useFakeTimers();

            cacheSet("test:resetting", "value");

            // Advance time to 80% of expiry
            vi.advanceTimersByTime(CACHE_EXPIRY_MS * 0.8);

            // Access the cache (should reset timer)
            expect(cacheGet("test:resetting")).toBe("value");

            // Advance another 80% - without reset, this would expire
            vi.advanceTimersByTime(CACHE_EXPIRY_MS * 0.8);

            // Should still be available because timer was reset
            expect(cacheGet("test:resetting")).toBe("value");

            // Now wait for full expiry without access
            vi.advanceTimersByTime(CACHE_EXPIRY_MS + 1);
            expect(cacheGet("test:resetting")).toBeUndefined();
        });

        it("cacheSet clears previous timer when overwriting", () => {
            vi.useFakeTimers();

            cacheSet("test:overwrite", "original");

            // Advance time to 80% of expiry
            vi.advanceTimersByTime(CACHE_EXPIRY_MS * 0.8);

            // Overwrite the value (should reset timer)
            cacheSet("test:overwrite", "updated");

            // Advance another 80% - without reset, this would expire
            vi.advanceTimersByTime(CACHE_EXPIRY_MS * 0.8);

            // Should still be available with updated value
            expect(cacheGet("test:overwrite")).toBe("updated");
        });
    });

    // ============================================
    // clearAllMangoCache
    // ============================================

    describe("clearAllMangoCache", () => {
        it("clears all cache entries", () => {
            cacheSet("tp:key1", "value1");
            cacheSet("td:key2", "value2");
            cacheSet("other:key3", "value3");

            expect(getCacheStats().size).toBe(3);

            clearAllMangoCache();

            expect(getCacheStats().size).toBe(0);
            expect(cacheGet("tp:key1")).toBeUndefined();
            expect(cacheGet("td:key2")).toBeUndefined();
            expect(cacheGet("other:key3")).toBeUndefined();
        });

        it("clears timers when clearing cache", () => {
            vi.useFakeTimers();

            cacheSet("test:key", "value");
            clearAllMangoCache();

            // Add new entry with same key
            cacheSet("test:key", "new value");

            // Advance time past original expiry
            vi.advanceTimersByTime(CACHE_EXPIRY_MS + 1);

            // New entry should still exist (old timer was cleared)
            // But it should have expired from its own timer
            expect(cacheGet("test:key")).toBeUndefined();
        });

        it("handles clearing empty cache", () => {
            expect(() => clearAllMangoCache()).not.toThrow();
            expect(getCacheStats().size).toBe(0);
        });
    });

    // ============================================
    // clearCacheByPrefix
    // ============================================

    describe("clearCacheByPrefix", () => {
        it("clears only entries with matching prefix", () => {
            cacheSet("tp:key1", "value1");
            cacheSet("tp:key2", "value2");
            cacheSet("td:key3", "value3");
            cacheSet("other:key4", "value4");

            clearCacheByPrefix("tp:");

            expect(cacheGet("tp:key1")).toBeUndefined();
            expect(cacheGet("tp:key2")).toBeUndefined();
            expect(cacheGet("td:key3")).toBe("value3");
            expect(cacheGet("other:key4")).toBe("value4");
        });

        it("handles non-matching prefix", () => {
            cacheSet("tp:key1", "value1");
            cacheSet("td:key2", "value2");

            clearCacheByPrefix("nonexistent:");

            expect(cacheGet("tp:key1")).toBe("value1");
            expect(cacheGet("td:key2")).toBe("value2");
        });

        it("handles empty cache", () => {
            expect(() => clearCacheByPrefix("tp:")).not.toThrow();
        });

        it("clears timers for cleared entries", () => {
            vi.useFakeTimers();

            cacheSet("tp:key", "value");
            clearCacheByPrefix("tp:");

            // Add entry with different prefix
            cacheSet("td:key", "different");

            // Advance time past original expiry
            vi.advanceTimersByTime(CACHE_EXPIRY_MS + 1);

            // td: entry should have expired normally
            expect(cacheGet("td:key")).toBeUndefined();
        });
    });

    // ============================================
    // getCacheStats
    // ============================================

    describe("getCacheStats", () => {
        it("returns stats for all entries when no prefix", () => {
            cacheSet("tp:key1", "value1");
            cacheSet("td:key2", "value2");
            cacheSet("other:key3", "value3");

            const stats = getCacheStats();

            expect(stats.size).toBe(3);
            expect(stats.keys).toHaveLength(3);
            expect(stats.keys).toContain("tp:key1");
            expect(stats.keys).toContain("td:key2");
            expect(stats.keys).toContain("other:key3");
        });

        it("returns filtered stats when prefix provided", () => {
            cacheSet("tp:key1", "value1");
            cacheSet("tp:key2", "value2");
            cacheSet("td:key3", "value3");

            const tpStats = getCacheStats("tp:");
            expect(tpStats.size).toBe(2);
            expect(tpStats.keys).toEqual(["tp:key1", "tp:key2"]);

            const tdStats = getCacheStats("td:");
            expect(tdStats.size).toBe(1);
            expect(tdStats.keys).toEqual(["td:key3"]);
        });

        it("returns empty stats for non-matching prefix", () => {
            cacheSet("tp:key1", "value1");

            const stats = getCacheStats("nonexistent:");

            expect(stats.size).toBe(0);
            expect(stats.keys).toEqual([]);
        });

        it("returns empty stats for empty cache", () => {
            const stats = getCacheStats();

            expect(stats.size).toBe(0);
            expect(stats.keys).toEqual([]);
        });
    });

    // ============================================
    // Cache key prefixes
    // ============================================

    describe("cache key prefixes", () => {
        it("CACHE_PREFIX_TEMPLATE is defined correctly", () => {
            expect(CACHE_PREFIX_TEMPLATE).toBe("tp:");
        });

        it("CACHE_PREFIX_TEMPLATE_DEXIE is defined correctly", () => {
            expect(CACHE_PREFIX_TEMPLATE_DEXIE).toBe("td:");
        });

        it("prefixes are used correctly with stats", () => {
            cacheSet(`${CACHE_PREFIX_TEMPLATE}key1`, "value1");
            cacheSet(`${CACHE_PREFIX_TEMPLATE_DEXIE}key2`, "value2");

            expect(getCacheStats(CACHE_PREFIX_TEMPLATE).size).toBe(1);
            expect(getCacheStats(CACHE_PREFIX_TEMPLATE_DEXIE).size).toBe(1);
        });
    });

    // ============================================
    // CACHE_EXPIRY_MS constant
    // ============================================

    describe("CACHE_EXPIRY_MS", () => {
        it("is set to 5 minutes", () => {
            expect(CACHE_EXPIRY_MS).toBe(5 * 60 * 1000);
        });
    });

    // ============================================
    // Template persistence (localStorage)
    // ============================================

    describe("template persistence", () => {
        // jsdom provides a real in-memory localStorage

        beforeEach(() => {
            clearPersistedTemplates();
            setWarmingFlag(false);
        });

        afterEach(() => {
            clearPersistedTemplates();
            setWarmingFlag(false);
        });

        it("scheduleTemplatePersist writes to localStorage after debounce", () => {
            vi.useFakeTimers();

            const template = { type: { $__idx: 0 } };
            scheduleTemplatePersist("tp::abc", template);

            // Not yet written (debounced)
            expect(localStorage.getItem("mango_tpl_cache")).toBeNull();

            // Flush the debounce timer
            vi.advanceTimersByTime(300);

            const raw = localStorage.getItem("mango_tpl_cache");
            expect(raw).not.toBeNull();
            const stored = JSON.parse(raw!);
            expect(stored.v).toBe(1);
            expect(stored.e).toHaveLength(1);
            expect(stored.e[0][0]).toBe("tp::abc");
            expect(stored.e[0][1]).toEqual(template);
        });

        it("batches multiple persists into one localStorage write", () => {
            vi.useFakeTimers();

            scheduleTemplatePersist("tp::key1", { a: 1 });
            scheduleTemplatePersist("tp::key2", { b: 2 });
            scheduleTemplatePersist("td::key3", { c: 3 });

            vi.advanceTimersByTime(300);

            const stored = JSON.parse(localStorage.getItem("mango_tpl_cache")!);
            expect(stored.e).toHaveLength(3);
        });

        it("getPersistedTemplates retrieves templates by prefix", () => {
            vi.useFakeTimers();

            scheduleTemplatePersist("tp::key1", { type: "A" });
            scheduleTemplatePersist("td::key2", { type: "B" });
            vi.advanceTimersByTime(300);

            const tpTemplates = getPersistedTemplates("tp:");
            expect(tpTemplates.size).toBe(1);
            expect(tpTemplates.get("tp::key1")).toEqual({ type: "A" });

            const tdTemplates = getPersistedTemplates("td:");
            expect(tdTemplates.size).toBe(1);
            expect(tdTemplates.get("td::key2")).toEqual({ type: "B" });
        });

        it("clearPersistedTemplates removes all persisted data", () => {
            vi.useFakeTimers();

            scheduleTemplatePersist("tp::key1", { a: 1 });
            vi.advanceTimersByTime(300);

            expect(localStorage.getItem("mango_tpl_cache")).not.toBeNull();

            clearPersistedTemplates();

            expect(localStorage.getItem("mango_tpl_cache")).toBeNull();
            expect(getPersistedTemplates("tp:").size).toBe(0);
        });

        it("suppresses persistence when warming flag is set", () => {
            vi.useFakeTimers();

            setWarmingFlag(true);
            scheduleTemplatePersist("tp::key1", { a: 1 });
            vi.advanceTimersByTime(300);

            expect(localStorage.getItem("mango_tpl_cache")).toBeNull();

            setWarmingFlag(false);
        });

        it("handles corrupt localStorage data gracefully", () => {
            localStorage.setItem("mango_tpl_cache", "not valid json{{{");

            const result = getPersistedTemplates("tp:");
            expect(result.size).toBe(0);

            // Should have cleaned up the corrupt data
            expect(localStorage.getItem("mango_tpl_cache")).toBeNull();
        });

        it("handles version mismatch gracefully", () => {
            localStorage.setItem(
                "mango_tpl_cache",
                JSON.stringify({ v: 999, e: [["tp::old", { old: true }]] }),
            );

            const result = getPersistedTemplates("tp:");
            expect(result.size).toBe(0);

            // Should have cleaned up the stale data
            expect(localStorage.getItem("mango_tpl_cache")).toBeNull();
        });

        it("merges new templates with existing persisted data", () => {
            vi.useFakeTimers();

            // First persist
            scheduleTemplatePersist("tp::key1", { a: 1 });
            vi.advanceTimersByTime(300);

            // Second persist (should merge)
            scheduleTemplatePersist("tp::key2", { b: 2 });
            vi.advanceTimersByTime(300);

            const stored = JSON.parse(localStorage.getItem("mango_tpl_cache")!);
            expect(stored.e).toHaveLength(2);

            const allTemplates = getPersistedTemplates("tp:");
            expect(allTemplates.size).toBe(2);
            expect(allTemplates.get("tp::key1")).toEqual({ a: 1 });
            expect(allTemplates.get("tp::key2")).toEqual({ b: 2 });
        });
    });
});
