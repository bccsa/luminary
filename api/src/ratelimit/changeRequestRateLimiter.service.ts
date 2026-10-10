import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RateLimiterConfig, RateLimiterService } from "./rateLimiter.service";

/**
 * Nest wrapper around {@link RateLimiterService} for POST /changerequest, configured under
 * `changeRequest.rateLimit`. Every request counts as one strike, so the limiter behaves as a
 * burst-plus-sustained-rate cap rather than an expensive-request penalty.
 */
@Injectable()
export class ChangeRequestRateLimiterService {
    private readonly limiter: RateLimiterService;

    constructor(configService: ConfigService) {
        this.limiter = new RateLimiterService(
            configService.get<RateLimiterConfig>("changeRequest.rateLimit"),
        );
    }

    /** Pre-execution gate. Allows everything when disabled. */
    check(key: string): { allowed: boolean; retryAfterMs: number } {
        return this.limiter.check(key);
    }

    /** Counts one request against the caller. No-op when disabled. */
    recordRequest(key: string): void {
        this.limiter.recordStrike(key);
    }
}
