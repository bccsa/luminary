import { describe, it, expect, vi, afterEach } from "vitest";
import { sessionNow, setSessionNow, __resetSessionNow, bumpSessionNow } from "./sessionNow";

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

describe("bumpSessionNow", () => {
    afterEach(() => {
        __resetSessionNow();
        vi.useRealTimers();
    });

    it("advances the bound forward", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        __resetSessionNow();
        sessionNow(); // capture the page-load bound

        bumpSessionNow(3_000_000);
        expect(sessionNow()).toBe(3_000_000);
    });

    it("ignores an older or equal value (forward-only)", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        __resetSessionNow();
        sessionNow();

        bumpSessionNow(500_000); // older → no-op
        expect(sessionNow()).toBe(1_000_000);
        bumpSessionNow(1_000_000); // equal → no-op
        expect(sessionNow()).toBe(1_000_000);
    });
});
