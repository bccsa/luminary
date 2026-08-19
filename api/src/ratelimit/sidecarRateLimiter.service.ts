import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SidecarRateLimitConfig } from "../configuration";
import { RateLimiterService } from "./rateLimiter.service";

/**
 * Two independently-bucketed limiters for GET /sidecar
 * (docs/sidecar/02-sidecar-rest-endpoint.md#rate-limiting): `read` bounds successful key fetches —
 * the harvesting risk, since a caller with View on a large group could otherwise walk every parent
 * id it already holds from sync and pull the whole encrypted library at HTTP speed — and `probe`
 * bounds repeated 403/404s (parent-id / permission probing) at a lower ceiling. Both default ON,
 * unlike the query limiter: /sidecar hands out secrets, /query does not.
 */
@Injectable()
export class SidecarRateLimiterService {
    private readonly read: RateLimiterService;
    private readonly probe: RateLimiterService;

    constructor(configService: ConfigService) {
        const cfg = configService.get<SidecarRateLimitConfig>("sidecar.rateLimit");
        this.read = new RateLimiterService(cfg?.read);
        this.probe = new RateLimiterService(cfg?.probe);
    }

    /** Pre-execution gate for a successful-read request. */
    checkRead(key: string): { allowed: boolean; retryAfterMs: number } {
        return this.read.check(key);
    }

    /** Post-execution strike after a request the caller could see (200). */
    recordReadStrike(key: string): void {
        this.read.recordStrike(key);
    }

    /** Pre-execution gate for the probe (403/404) limiter. */
    checkProbe(key: string): { allowed: boolean; retryAfterMs: number } {
        return this.probe.check(key);
    }

    /** Post-execution strike after a 403 or 404 response. */
    recordProbeStrike(key: string): void {
        this.probe.recordStrike(key);
    }
}
