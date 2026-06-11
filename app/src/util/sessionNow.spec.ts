import { describe, it, expect, vi, afterEach } from "vitest";
import { sessionNow, __resetSessionNow } from "./sessionNow";

describe("sessionNow", () => {
    afterEach(() => {
        __resetSessionNow();
        vi.useRealTimers();
    });

    it("captures the timestamp on first read", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_700_000_000_000);
        __resetSessionNow();

        expect(sessionNow()).toBe(1_700_000_000_000);
    });

    it("returns the same frozen value after the clock advances", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_700_000_000_000);
        __resetSessionNow();
        const first = sessionNow();

        vi.setSystemTime(1_700_000_000_000 + 5 * 60_000); // +5 minutes
        const second = sessionNow();

        expect(second).toBe(first);
    });

    it("re-captures after a reset (fresh page load)", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_700_000_000_000);
        __resetSessionNow();
        expect(sessionNow()).toBe(1_700_000_000_000);

        __resetSessionNow();
        vi.setSystemTime(1_700_000_123_000);
        expect(sessionNow()).toBe(1_700_000_123_000);
    });
});
