export type BoundedTtlCacheOptions = {
    /** Soft cap on tracked entries; a sweep runs when exceeded. Default 50_000. */
    maxEntries?: number;
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
 * Same shape as {@link ../ratelimit/strikeLimiter.StrikeLimiter}: no background
 * timers (which would show up as open handles in tests / shutdown). Entries expire
 * lazily — an expired entry is dropped on the `get()` that next touches it — and a
 * `sweep()` of all expired entries runs before an insert once `maxEntries` is reached.
 *
 * `maxEntries` is a soft OOM guardrail, not a working-set limiter: the sweep only
 * removes already-expired entries, so the map can briefly exceed the cap if every
 * entry is still live. TTL is what bounds the steady-state size.
 */
export class BoundedTtlCache<V> {
    private readonly maxEntries: number;
    private readonly now: () => number;
    private readonly entries = new Map<string, Entry<V>>();

    constructor(options: BoundedTtlCacheOptions = {}) {
        this.maxEntries = options.maxEntries ?? 50_000;
        this.now = options.now ?? Date.now;
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
        if (!this.entries.has(key) && this.entries.size >= this.maxEntries) this.sweep();
        this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
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
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) this.entries.delete(key);
        }
    }

    get size(): number {
        return this.entries.size;
    }
}
