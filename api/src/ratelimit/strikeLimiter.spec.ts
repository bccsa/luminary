import { StrikeLimiter, StrikeLimiterOptions } from "./strikeLimiter";

describe("StrikeLimiter", () => {
    let nowMs: number;
    const now = () => nowMs;

    const make = (over: Partial<StrikeLimiterOptions> = {}) =>
        new StrikeLimiter({
            freeStrikes: 3,
            baseBackoffMs: 5000,
            maxBackoffMs: 300000,
            strikeDecayMs: 600000,
            now,
            ...over,
        });

    beforeEach(() => {
        nowMs = 0;
    });

    it("allows an unknown key", () => {
        const l = make();
        expect(l.check("nobody").allowed).toBe(true);
    });

    it("allows up to freeStrikes without blocking", () => {
        const l = make();
        l.recordStrike("u");
        l.recordStrike("u");
        l.recordStrike("u");
        expect(l.check("u").allowed).toBe(true);
    });

    it("blocks on the first strike past freeStrikes, with base backoff", () => {
        const l = make();
        for (let i = 0; i < 4; i++) l.recordStrike("u");
        const r = l.check("u");
        expect(r.allowed).toBe(false);
        expect(r.retryAfterMs).toBe(5000);
    });

    it("grows the backoff exponentially per extra strike", () => {
        const l = make();
        for (let i = 0; i < 5; i++) l.recordStrike("u"); // over = 2
        expect(l.check("u").retryAfterMs).toBe(10000);
        l.recordStrike("u"); // over = 3
        expect(l.check("u").retryAfterMs).toBe(20000);
    });

    it("caps the backoff at maxBackoffMs", () => {
        const l = make();
        for (let i = 0; i < 12; i++) l.recordStrike("u"); // way past the cap
        expect(l.check("u").retryAfterMs).toBe(300000);
    });

    it("forgives strikes as time passes (decay)", () => {
        const l = make();
        for (let i = 0; i < 4; i++) l.recordStrike("u"); // blocked
        nowMs += 600000; // one decay interval
        // Block window (5s) long past; one strike forgiven → back under the free line.
        expect(l.check("u").allowed).toBe(true);
        // The next strike starts the backoff over at base, proving the count dropped.
        l.recordStrike("u");
        expect(l.check("u").retryAfterMs).toBe(5000);
    });

    it("lazily evicts a fully decayed, unblocked entry on check", () => {
        const l = make();
        for (let i = 0; i < 4; i++) l.recordStrike("u");
        nowMs += 4 * 600000; // forgive all 4 strikes
        expect(l.check("u").allowed).toBe(true);
        expect(l.size).toBe(0);
    });

    it("sweeps decayed entries when maxEntries is exceeded", () => {
        const l = make({ maxEntries: 2 });
        l.recordStrike("u1");
        l.recordStrike("u2");
        expect(l.size).toBe(2);
        nowMs += 600000; // both decay to zero strikes (were under the free line)
        l.recordStrike("u3"); // size >= maxEntries → sweep before insert
        expect(l.size).toBe(1);
        expect(l.check("u1").allowed).toBe(true);
    });

    it("keys are independent", () => {
        const l = make();
        for (let i = 0; i < 4; i++) l.recordStrike("a");
        expect(l.check("a").allowed).toBe(false);
        expect(l.check("b").allowed).toBe(true);
    });
});
