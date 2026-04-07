import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";

// Mock dexie's liveQuery
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();

vi.mock("dexie", () => ({
    liveQuery: vi.fn(() => ({
        subscribe: mockSubscribe,
    })),
}));

import { useDexieLiveQuery, useDexieLiveQueryWithDeps } from "./useDexieLiveQuery";
import { liveQuery } from "dexie";

describe("useDexieLiveQuery", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSubscribe.mockReturnValue({ unsubscribe: mockUnsubscribe });
    });

    it("returns a ref with default undefined initial value", () => {
        const scope = effectScope();
        scope.run(() => {
            const result = useDexieLiveQuery(() => Promise.resolve("test"));
            expect(result.value).toBeUndefined();
        });
        scope.stop();
    });

    it("returns a ref with provided initial value", () => {
        const scope = effectScope();
        scope.run(() => {
            const result = useDexieLiveQuery(() => Promise.resolve("test"), {
                initialValue: "initial",
            });
            expect(result.value).toBe("initial");
        });
        scope.stop();
    });

    it("calls liveQuery with the querier", () => {
        const querier = () => Promise.resolve("data");
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQuery(querier);
        });
        expect(liveQuery).toHaveBeenCalledWith(querier);
        expect(mockSubscribe).toHaveBeenCalledWith(
            expect.objectContaining({ next: expect.any(Function), error: expect.any(Function) }),
        );
        scope.stop();
    });

    it("updates value when subscription emits next", () => {
        const scope = effectScope();
        let resultRef: any;
        scope.run(() => {
            resultRef = useDexieLiveQuery(() => Promise.resolve("data"));
        });

        // Simulate next emission
        const { next } = mockSubscribe.mock.calls[0][0];
        next("new-value");
        expect(resultRef.value).toBe("new-value");
        scope.stop();
    });

    it("calls onError when subscription emits error", () => {
        const onError = vi.fn();
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQuery(() => Promise.resolve("data"), { onError });
        });

        const { error } = mockSubscribe.mock.calls[0][0];
        const testError = new Error("test error");
        error(testError);
        expect(onError).toHaveBeenCalledWith(testError);
        scope.stop();
    });

    it("retries on error after 100ms", async () => {
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQuery(() => Promise.resolve("data"));
        });

        const callCountBefore = mockSubscribe.mock.calls.length;
        const { error } = mockSubscribe.mock.calls[0][0];

        // Trigger error - should restart after 100ms
        error(new Error("transient"));

        await new Promise((r) => setTimeout(r, 150));
        expect(mockSubscribe.mock.calls.length).toBeGreaterThan(callCountBefore);
        scope.stop();
    });

    it("unsubscribes on scope dispose", () => {
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQuery(() => Promise.resolve("data"));
        });

        expect(mockUnsubscribe).not.toHaveBeenCalled();
        scope.stop();
        expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it("works without scope (no dispose registration)", () => {
        // Call outside effectScope - should not throw
        const result = useDexieLiveQuery(() => Promise.resolve("data"));
        expect(result.value).toBeUndefined();
        expect(mockSubscribe).toHaveBeenCalled();
    });
});

describe("useDexieLiveQueryWithDeps", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSubscribe.mockReturnValue({ unsubscribe: mockUnsubscribe });
    });

    it("subscribes immediately with deps value", async () => {
        const dep = ref("dep-value");
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQueryWithDeps(dep, (val: string) => Promise.resolve(val));
        });

        await nextTick();
        expect(liveQuery).toHaveBeenCalled();
        expect(mockSubscribe).toHaveBeenCalled();
        scope.stop();
    });

    it("re-subscribes when deps change", async () => {
        const dep = ref("initial");
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQueryWithDeps(dep, (val: string) => Promise.resolve(val));
        });

        await nextTick();
        const callCount = mockSubscribe.mock.calls.length;

        dep.value = "changed";
        await nextTick();

        expect(mockSubscribe.mock.calls.length).toBeGreaterThan(callCount);
        // Previous subscription should be unsubscribed
        expect(mockUnsubscribe).toHaveBeenCalled();
        scope.stop();
    });

    it("returns initial value", async () => {
        const dep = ref("dep");
        const scope = effectScope();
        let resultRef: any;
        scope.run(() => {
            resultRef = useDexieLiveQueryWithDeps(dep, () => Promise.resolve("data"), {
                initialValue: "init",
            });
        });

        expect(resultRef.value).toBe("init");
        scope.stop();
    });

    it("unsubscribes on scope dispose", async () => {
        const dep = ref("dep");
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQueryWithDeps(dep, () => Promise.resolve("data"));
        });

        await nextTick();
        scope.stop();
        expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it("handles error with retry", async () => {
        const dep = ref("dep");
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQueryWithDeps(dep, () => Promise.resolve("data"));
        });

        await nextTick();
        const callCount = mockSubscribe.mock.calls.length;

        const { error } = mockSubscribe.mock.calls[0][0];
        error(new Error("test"));

        await new Promise((r) => setTimeout(r, 150));
        expect(mockSubscribe.mock.calls.length).toBeGreaterThan(callCount);
        scope.stop();
    });
});
