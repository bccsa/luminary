import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QueryRateLimitConfig } from "../configuration";
import { StrikeLimiter } from "./strikeLimiter";

/**
 * Nest wrapper around {@link StrikeLimiter} for the POST /query path. Reads
 * `query.rateLimit.*` config and is a no-op (always allows, never strikes) when
 * `enabled` is false — which is the default, so this ships dark until an operator
 * opts in per environment after observing the expensive-query logs.
 */
@Injectable()
export class QueryRateLimiterService {
    private readonly enabled: boolean;
    private readonly limiter?: StrikeLimiter;

    constructor(private readonly configService: ConfigService) {
        const cfg = this.configService.get<QueryRateLimitConfig>("query.rateLimit");
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

    /** Post-execution strike for an expensive query. No-op when disabled. */
    recordStrike(key: string): void {
        if (this.enabled && this.limiter) this.limiter.recordStrike(key);
    }
}
