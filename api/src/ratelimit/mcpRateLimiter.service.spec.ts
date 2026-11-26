import { ConfigService } from "@nestjs/config";
import { McpRateLimiterService } from "./mcpRateLimiter.service";

function makeService(rateLimit: any): McpRateLimiterService {
    const configService = {
        get: (key: string) => (key === "mcp.rateLimit" ? rateLimit : undefined),
    } as unknown as ConfigService;
    return new McpRateLimiterService(configService);
}

const config = {
    enabled: true,
    freeStrikes: 3,
    baseBackoffMs: 1000,
    maxBackoffMs: 5000,
    strikeDecayMs: 60000,
};

describe("McpRateLimiterService", () => {
    it("always allows when disabled", () => {
        const svc = makeService({ enabled: false });
        for (let i = 0; i < 1000; i++) svc.recordCall("u");
        expect(svc.check("u").allowed).toBe(true);
    });

    it("allows a burst of calls, then blocks the caller", () => {
        const svc = makeService(config);
        for (let i = 0; i < 4; i++) svc.recordCall("u");

        const gate = svc.check("u");
        expect(gate.allowed).toBe(false);
        expect(gate.retryAfterMs).toBeGreaterThan(0);
    });

    it("limits each identity separately", () => {
        const svc = makeService(config);
        for (let i = 0; i < 4; i++) svc.recordCall("a");

        expect(svc.check("a").allowed).toBe(false);
        expect(svc.check("b").allowed).toBe(true);
    });
});
