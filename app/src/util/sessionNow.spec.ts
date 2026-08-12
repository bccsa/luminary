import { describe, it, expect, vi, afterEach } from "vitest";
import { sessionNow, setSessionNow, __resetSessionNow } from "./sessionNow";

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

    it("pins the reference time without reading the clock, and wins over a later capture", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_700_000_000_000);
        __resetSessionNow();

        setSessionNow(1_750_000_000_000);
        // The pinned value is returned, not the wall clock.
        expect(sessionNow()).toBe(1_750_000_000_000);

        // Advancing the clock does not re-capture over the pin.
        vi.setSystemTime(1_700_000_500_000);
        expect(sessionNow()).toBe(1_750_000_000_000);
    });
});
