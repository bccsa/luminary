import { ConfigService } from "@nestjs/config";
import { ChangeRequestRateLimiterService } from "./changeRequestRateLimiter.service";

function makeService(rateLimit: any): ChangeRequestRateLimiterService {
    const configService = {
        get: (key: string) => (key === "changeRequest.rateLimit" ? rateLimit : undefined),
    } as unknown as ConfigService;
    return new ChangeRequestRateLimiterService(configService);
}

describe("ChangeRequestRateLimiterService", () => {
    it("always allows when disabled", () => {
        const svc = makeService({ enabled: false });
        for (let i = 0; i < 1000; i++) svc.recordRequest("u");
        expect(svc.check("u").allowed).toBe(true);
    });

    it("allows a burst up to freeStrikes, then blocks the caller", () => {
        const svc = makeService({
            enabled: true,
            freeStrikes: 3,
            baseBackoffMs: 1000,
            maxBackoffMs: 5000,
            strikeDecayMs: 60000,
        });

        for (let i = 0; i < 3; i++) {
            expect(svc.check("u").allowed).toBe(true);
            svc.recordRequest("u");
        }
        svc.recordRequest("u");

        const gate = svc.check("u");
        expect(gate.allowed).toBe(false);
        expect(gate.retryAfterMs).toBeGreaterThan(0);
    });

    it("limits each identity separately", () => {
        const svc = makeService({
            enabled: true,
            freeStrikes: 1,
            baseBackoffMs: 1000,
            maxBackoffMs: 5000,
            strikeDecayMs: 60000,
        });
        svc.recordRequest("a");
        svc.recordRequest("a");

        expect(svc.check("a").allowed).toBe(false);
        expect(svc.check("b").allowed).toBe(true);
    });
});
