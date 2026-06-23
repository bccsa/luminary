export type StrikeLimiterOptions = {
    /** Strikes tolerated before the first block (e.g. 3 → blocks start on the 4th). */
    freeStrikes: number;
    /** First block duration (ms); doubles per extra strike up to maxBackoffMs. */
    baseBackoffMs: number;
    /** Cap on a single block window (ms). */
    maxBackoffMs: number;
    /** One strike is forgiven per this many ms elapsed since the last update. */
    strikeDecayMs: number;
    /** Soft cap on tracked identities; a sweep runs when exceeded. Default 10_000. */
    maxEntries?: number;
    /** Injectable clock (ms). Defaults to Date.now. */
    now?: () => number;
};

type Entry = {
    strikes: number;
    lastUpdate: number;
    blockedUntil: number;
};

/**
 * In-memory per-key exponential-backoff strike limiter. Cost is only known AFTER a
 * query runs, so callers `recordStrike(key)` post-hoc on an expensive query and
 * `check(key)` pre-execution on the next request — enforcement bites the next request,
 * not the offending one.
 *
 * No timers: entries decay lazily on every touch and a `sweep()` runs when the entry
 * count exceeds `maxEntries`. This keeps memory bounded without a background interval
 * (which would otherwise show up as an open handle in tests / shutdown).
 */
export class StrikeLimiter {
    private readonly opts: Required<Omit<StrikeLimiterOptions, "now">> & { now: () => number };
    private readonly entries = new Map<string, Entry>();

    constructor(options: StrikeLimiterOptions) {
        this.opts = {
            freeStrikes: options.freeStrikes,
            baseBackoffMs: options.baseBackoffMs,
            maxBackoffMs: options.maxBackoffMs,
            strikeDecayMs: options.strikeDecayMs,
            maxEntries: options.maxEntries ?? 10_000,
            now: options.now ?? Date.now,
        };
    }

    /** Whether `key` may proceed; if not, how long (ms) until it may. */
    check(key: string): { allowed: boolean; retryAfterMs: number } {
        const now = this.opts.now();
        const entry = this.entries.get(key);
        if (!entry) return { allowed: true, retryAfterMs: 0 };

        this.decay(entry, now);

        if (entry.blockedUntil > now) {
            return { allowed: false, retryAfterMs: entry.blockedUntil - now };
        }

        // Fully decayed and not blocked → drop it (lazy eviction).
        if (entry.strikes <= 0 && entry.blockedUntil <= now) {
            this.entries.delete(key);
        }
        return { allowed: true, retryAfterMs: 0 };
    }

    /** Record an expensive-query strike for `key`, extending its backoff if warranted. */
    recordStrike(key: string): void {
        const now = this.opts.now();
        let entry = this.entries.get(key);
        if (!entry) {
            if (this.entries.size >= this.opts.maxEntries) this.sweep();
            entry = { strikes: 0, lastUpdate: now, blockedUntil: 0 };
            this.entries.set(key, entry);
        } else {
            this.decay(entry, now);
        }

        entry.strikes++;
        entry.lastUpdate = now;

        const over = entry.strikes - this.opts.freeStrikes;
        if (over > 0) {
            const backoff = Math.min(
                this.opts.maxBackoffMs,
                this.opts.baseBackoffMs * 2 ** (over - 1),
            );
            entry.blockedUntil = now + backoff;
        }
    }

    /** Drop all entries that have fully decayed and are not currently blocked. */
    sweep(): void {
        const now = this.opts.now();
        for (const [key, entry] of this.entries) {
            this.decay(entry, now);
            if (entry.strikes <= 0 && entry.blockedUntil <= now) this.entries.delete(key);
        }
    }

    get size(): number {
        return this.entries.size;
    }

    private decay(entry: Entry, now: number): void {
        if (this.opts.strikeDecayMs <= 0) return;
        const forgiven = Math.floor((now - entry.lastUpdate) / this.opts.strikeDecayMs);
        if (forgiven > 0) {
            entry.strikes = Math.max(0, entry.strikes - forgiven);
            entry.lastUpdate = now;
        }
    }
}
