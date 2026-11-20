import { describe, it, expect, vi, afterEach } from "vitest";
import { isTransientIndexedDbError, retryOnTransientIndexedDbError } from "./transientRetry";

describe("isTransientIndexedDbError", () => {
    it("matches AbortError by name", () => {
        expect(isTransientIndexedDbError(new DOMException("x", "AbortError"))).toBe(true);
    });

    it("matches in-progress transaction and missing cursor messages", () => {
        expect(isTransientIndexedDbError({ message: "...in-progress transaction..." })).toBe(true);
        expect(isTransientIndexedDbError({ message: "cursor that doesn't exist" })).toBe(true);
    });

    it("rejects other errors and non-objects", () => {
        expect(isTransientIndexedDbError(new Error("QuotaExceededError"))).toBe(false);
        expect(isTransientIndexedDbError(null)).toBe(false);
        expect(isTransientIndexedDbError("AbortError")).toBe(false);
    });
});

describe("retryOnTransientIndexedDbError", () => {
    afterEach(() => vi.useRealTimers());

    it("skips the retry and rethrows when shouldAbort is true after the delay", async () => {
        vi.useFakeTimers();
        const err = new DOMException("x", "AbortError");
        const op = vi.fn().mockRejectedValue(err);

        const p = retryOnTransientIndexedDbError(op, () => true);
        const assertion = expect(p).rejects.toBe(err);
        await vi.advanceTimersByTimeAsync(100);
        await assertion;
        expect(op).toHaveBeenCalledTimes(1);
    });
});
