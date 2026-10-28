export type BoundedTtlCacheOptions = {
    /** Hard cap on entries; at the cap the oldest entry is evicted. Default 50_000. */
    maxEntries?: number;
    /** How often (ms) an insert first sweeps out expired entries. Default 300_000. */
    sweepIntervalMs?: number;
    /** Injectable clock (ms). Defaults to Date.now. */
    now?: () => number;
};

type Entry<V> = {
    value: V;
    expiresAt: number;
};

/**
 * Minimal in-memory key→value cache with per-entry TTL and a bounded entry count.
 *
 * No background timers (they show up as open handles in tests / shutdown): expired entries
 * are dropped on the `get()` that touches them, and by a full `sweep()` that an insert runs
 * at most once per `sweepIntervalMs`. TTL bounds the steady-state size; `maxEntries` is only
 * an emergency cap.
 */
export class BoundedTtlCache<V> {
    private readonly maxEntries: number;
    private readonly sweepIntervalMs: number;
    private readonly now: () => number;
    private readonly entries = new Map<string, Entry<V>>();
    private lastSweepAt: number;

    constructor(options: BoundedTtlCacheOptions = {}) {
        this.maxEntries = options.maxEntries ?? 50_000;
        this.sweepIntervalMs = options.sweepIntervalMs ?? 300_000;
        this.now = options.now ?? Date.now;
        this.lastSweepAt = this.now();
    }

    /** Return the cached value, or undefined if missing or expired (dropping it). */
    get(key: string): V | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= this.now()) {
            this.entries.delete(key); // lazy eviction
            return undefined;
        }
        return entry.value;
    }

    /** Cache `value` under `key` for `ttlMs`. A non-positive ttl is a no-op. */
    set(key: string, value: V, ttlMs: number): void {
        if (ttlMs <= 0) return;
        const now = this.now();
        if (now - this.lastSweepAt >= this.sweepIntervalMs) this.sweep();

        // Re-insert at the back so the front of the Map is always the oldest entry.
        this.entries.delete(key);
        if (this.entries.size >= this.maxEntries) {
            this.entries.delete(this.entries.keys().next().value);
        }
        this.entries.set(key, { value, expiresAt: now + ttlMs });
    }

    delete(key: string): void {
        this.entries.delete(key);
    }

    clear(): void {
        this.entries.clear();
    }

    /** Drop every entry whose TTL has elapsed. */
    sweep(): void {
        const now = this.now();
        this.lastSweepAt = now;
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) this.entries.delete(key);
        }
    }

    get size(): number {
        return this.entries.size;
    }
}
