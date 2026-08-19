import { StrikeLimiter } from "./strikeLimiter";

export type RateLimiterConfig = {
    /** Master switch. When false (or config absent), every call is a no-op that always allows. */
    enabled: boolean;
    /** Strikes tolerated before the first block (e.g. 3 → blocks start on the 4th). */
    freeStrikes: number;
    /** First block duration (ms); doubles per extra strike up to maxBackoffMs. */
    baseBackoffMs: number;
    /** Cap on a single block window (ms). */
    maxBackoffMs: number;
    /** One strike is forgiven per this many ms elapsed since the last update. */
    strikeDecayMs: number;
};

/**
 * Config-gated, per-identity {@link StrikeLimiter} wrapper. Not a Nest `@Injectable()` itself —
 * an endpoint that needs one or more independently-bucketed limiters constructs them from its own
 * config slice inside its own Nest service (see `QueryRateLimiterService`,
 * `SidecarRateLimiterService`), so hammering one endpoint's limiter never blocks callers on
 * another's.
 */
export class RateLimiterService {
    private readonly enabled: boolean;
    private readonly limiter?: StrikeLimiter;

    constructor(cfg: RateLimiterConfig | undefined) {
        this.enabled = !!cfg?.enabled;
        if (this.enabled) {
            this.limiter = new StrikeLimiter({
                freeStrikes: cfg.freeStrikes,
                baseBackoffMs: cfg.baseBackoffMs,
                maxBackoffMs: cfg.maxBackoffMs,
                strikeDecayMs: cfg.strikeDecayMs,
            });
        }
    }

    /** Pre-execution gate. Allows everything when disabled. */
    check(key: string): { allowed: boolean; retryAfterMs: number } {
        if (!this.enabled || !this.limiter) return { allowed: true, retryAfterMs: 0 };
        return this.limiter.check(key);
    }

    /** Post-execution strike. No-op when disabled. */
    recordStrike(key: string): void {
        if (this.enabled && this.limiter) this.limiter.recordStrike(key);
    }
}
