import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RateLimiterConfig, RateLimiterService } from "./rateLimiter.service";

/**
 * Nest wrapper around {@link RateLimiterService} for MCP tool calls, configured under
 * `mcp.rateLimit`. Every call counts as one strike (a burst-plus-sustained-rate cap). The query
 * and change-request limiters still apply to the work a tool does.
 */
@Injectable()
export class McpRateLimiterService {
    private readonly limiter: RateLimiterService;

    constructor(configService: ConfigService) {
        this.limiter = new RateLimiterService(
            configService.get<RateLimiterConfig>("mcp.rateLimit"),
        );
    }

    /** Pre-execution gate. Allows everything when disabled. */
    check(key: string): { allowed: boolean; retryAfterMs: number } {
        return this.limiter.check(key);
    }

    /** Counts one tool call against the caller. No-op when disabled. */
    recordCall(key: string): void {
        this.limiter.recordStrike(key);
    }
}
