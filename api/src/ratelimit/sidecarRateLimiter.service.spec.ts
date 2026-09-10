import { ConfigService } from "@nestjs/config";
import { SidecarRateLimiterService } from "./sidecarRateLimiter.service";

const RATE_LIMIT_KEY = "sidecar.rateLimit";

function makeService(rateLimit: any): SidecarRateLimiterService {
    const configService = {
        get: (key: string) => (key === RATE_LIMIT_KEY ? rateLimit : undefined),
    } as unknown as ConfigService;
    return new SidecarRateLimiterService(configService);
}

const disabled = { enabled: false, freeStrikes: 0, baseBackoffMs: 0, maxBackoffMs: 0, strikeDecayMs: 0 };
const oneFreeStrike = {
    enabled: true,
    freeStrikes: 1,
    baseBackoffMs: 5000,
    maxBackoffMs: 300000,
    strikeDecayMs: 600000,
};

describe("SidecarRateLimiterService", () => {
    it("is a no-op on both limiters when disabled", () => {
        const svc = makeService({ read: disabled, probe: disabled });
        for (let i = 0; i < 100; i++) {
            svc.recordReadStrike("u");
            svc.recordProbeStrike("u");
        }
        expect(svc.checkRead("u")).toEqual({ allowed: true, retryAfterMs: 0 });
        expect(svc.checkProbe("u")).toEqual({ allowed: true, retryAfterMs: 0 });
    });

    it("is a no-op when config is absent", () => {
        const svc = makeService(undefined);
        svc.recordReadStrike("u");
        svc.recordProbeStrike("u");
        expect(svc.checkRead("u").allowed).toBe(true);
        expect(svc.checkProbe("u").allowed).toBe(true);
    });

    it("buckets the read and probe limiters independently", () => {
        const svc = makeService({ read: oneFreeStrike, probe: oneFreeStrike });

        svc.recordReadStrike("u"); // within free allowance
        svc.recordReadStrike("u"); // past free allowance → blocks read only
        expect(svc.checkRead("u").allowed).toBe(false);
        expect(svc.checkProbe("u").allowed).toBe(true);

        svc.recordProbeStrike("u");
        svc.recordProbeStrike("u"); // past free allowance → blocks probe too
        expect(svc.checkProbe("u").allowed).toBe(false);
    });

    it("buckets identities independently within a limiter", () => {
        const svc = makeService({ read: oneFreeStrike, probe: oneFreeStrike });

        svc.recordReadStrike("a");
        svc.recordReadStrike("a");
        expect(svc.checkRead("a").allowed).toBe(false);
        expect(svc.checkRead("b").allowed).toBe(true);
    });
});
