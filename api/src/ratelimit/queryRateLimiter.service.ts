import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RateLimiterConfig, RateLimiterService } from "./rateLimiter.service";

/**
 * Nest wrapper around {@link RateLimiterService} for the POST /query path. Reads
 * `query.rateLimit.*` config and is a no-op (always allows, never strikes) when
 * `enabled` is false — which is the default, so this ships dark until an operator
 * opts in per environment after observing the expensive-query logs.
 */
@Injectable()
export class QueryRateLimiterService {
    private readonly limiter: RateLimiterService;

    constructor(configService: ConfigService) {
        this.limiter = new RateLimiterService(
            configService.get<RateLimiterConfig>("query.rateLimit"),
        );
    }

    /** Pre-execution gate. Allows everything when disabled. */
    check(key: string): { allowed: boolean; retryAfterMs: number } {
        return this.limiter.check(key);
    }

    /** Post-execution strike for an expensive query. No-op when disabled. */
    recordStrike(key: string): void {
        this.limiter.recordStrike(key);
    }
}
