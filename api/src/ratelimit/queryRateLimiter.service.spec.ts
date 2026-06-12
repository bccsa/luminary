import { ConfigService } from "@nestjs/config";
import { QueryRateLimiterService } from "./queryRateLimiter.service";

const RATE_LIMIT_KEY = "query.rateLimit";

function makeService(rateLimit: any): QueryRateLimiterService {
    const configService = {
        get: (key: string) => (key === RATE_LIMIT_KEY ? rateLimit : undefined),
    } as unknown as ConfigService;
    return new QueryRateLimiterService(configService);
}

describe("QueryRateLimiterService", () => {
    it("is a no-op when disabled (config enabled=false)", () => {
        const svc = makeService({ enabled: false });
        // Even after many strikes, it always allows.
        for (let i = 0; i < 100; i++) svc.recordStrike("u");
        expect(svc.check("u")).toEqual({ allowed: true, retryAfterMs: 0 });
    });

    it("is a no-op when config is absent", () => {
        const svc = makeService(undefined);
        svc.recordStrike("u");
        expect(svc.check("u").allowed).toBe(true);
    });

    it("enforces backoff when enabled", () => {
        const svc = makeService({
            enabled: true,
            freeStrikes: 1,
            baseBackoffMs: 5000,
            maxBackoffMs: 300000,
            strikeDecayMs: 600000,
        });
        svc.recordStrike("u"); // within free allowance
        expect(svc.check("u").allowed).toBe(true);
        svc.recordStrike("u"); // past free allowance → blocked
        const r = svc.check("u");
        expect(r.allowed).toBe(false);
        expect(r.retryAfterMs).toBeGreaterThan(0);
    });
});
