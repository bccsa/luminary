import { RateLimiterService } from "./rateLimiter.service";

describe("RateLimiterService", () => {
    it("is a no-op when disabled (config enabled=false)", () => {
        const svc = new RateLimiterService({
            enabled: false,
            freeStrikes: 1,
            baseBackoffMs: 5000,
            maxBackoffMs: 300000,
            strikeDecayMs: 600000,
        });
        for (let i = 0; i < 100; i++) svc.recordStrike("u");
        expect(svc.check("u")).toEqual({ allowed: true, retryAfterMs: 0 });
    });

    it("is a no-op when config is absent", () => {
        const svc = new RateLimiterService(undefined);
        svc.recordStrike("u");
        expect(svc.check("u").allowed).toBe(true);
    });

    it("enforces backoff when enabled", () => {
        const svc = new RateLimiterService({
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

    it("buckets identities independently of any other RateLimiterService instance", () => {
        const a = new RateLimiterService({
            enabled: true,
            freeStrikes: 0,
            baseBackoffMs: 5000,
            maxBackoffMs: 300000,
            strikeDecayMs: 600000,
        });
        const b = new RateLimiterService({
            enabled: true,
            freeStrikes: 0,
            baseBackoffMs: 5000,
            maxBackoffMs: 300000,
            strikeDecayMs: 600000,
        });
        a.recordStrike("u");
        expect(a.check("u").allowed).toBe(false);
        expect(b.check("u").allowed).toBe(true);
    });
});
