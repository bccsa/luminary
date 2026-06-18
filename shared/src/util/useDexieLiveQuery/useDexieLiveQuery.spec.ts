import { describe, it, expect, vi, beforeEach } from "vitest";
import { effectScope, nextTick, reactive, ref } from "vue";

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

    it("calls liveQuery with a wrapper that invokes the querier", () => {
        // The unified impl wraps the querier (so watched deps can be forwarded), so we
        // assert behaviour — invoking the wrapper runs the querier — rather than identity.
        const querier = vi.fn(() => Promise.resolve("data"));
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQuery(querier);
        });
        expect(liveQuery).toHaveBeenCalledWith(expect.any(Function));
        const wrapped = vi.mocked(liveQuery).mock.calls[0][0] as () => unknown;
        wrapped();
        expect(querier).toHaveBeenCalled();
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

describe("useDexieLiveQuery with deps in options", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSubscribe.mockReturnValue({ unsubscribe: mockUnsubscribe });
    });

    it("subscribes immediately when deps is passed in options", async () => {
        const dep = ref("dep-value");
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQuery((val: string) => Promise.resolve(val), { deps: dep });
        });

        await nextTick();
        expect(liveQuery).toHaveBeenCalled();
        expect(mockSubscribe).toHaveBeenCalled();
        scope.stop();
    });

    it("re-subscribes (and unsubscribes the old subscription) when a dep changes", async () => {
        const dep = ref("initial");
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQuery((val: string) => Promise.resolve(val), { deps: dep });
        });

        await nextTick();
        const callCount = mockSubscribe.mock.calls.length;

        dep.value = "changed";
        await nextTick();

        expect(mockSubscribe.mock.calls.length).toBeGreaterThan(callCount);
        expect(mockUnsubscribe).toHaveBeenCalled();
        scope.stop();
    });

    it("forwards the watched value(s) to the querier on change", async () => {
        const dep = ref("a");
        const querier = vi.fn((val: string) => Promise.resolve(val));
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQuery(querier, { deps: dep });
        });

        await nextTick();
        dep.value = "b";
        await nextTick();

        // liveQuery is called with a wrapper that invokes querier(...data); run the latest one.
        const wrapped = vi.mocked(liveQuery).mock.calls.at(-1)![0] as () => unknown;
        wrapped();
        expect(querier).toHaveBeenLastCalledWith("b", "a", expect.any(Function));
        scope.stop();
    });

    it("watches an array of refs passed via deps", async () => {
        const a = ref(1);
        const b = ref(2);
        const querier = vi.fn((vals: [number, number]) => Promise.resolve(vals));
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQuery(querier, { deps: [a, b] });
        });

        await nextTick();
        const callCount = mockSubscribe.mock.calls.length;

        a.value = 10;
        await nextTick();

        expect(mockSubscribe.mock.calls.length).toBeGreaterThan(callCount);
        const wrapped = vi.mocked(liveQuery).mock.calls.at(-1)![0] as () => unknown;
        wrapped();
        expect(querier.mock.calls.at(-1)![0]).toEqual([10, 2]);
        scope.stop();
    });

    it("watches a reactive object passed via deps", async () => {
        const state = reactive({ a: 1 });
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQuery(() => Promise.resolve(state.a), { deps: state });
        });

        await nextTick();
        const callCount = mockSubscribe.mock.calls.length;

        state.a = 2;
        await nextTick();

        expect(mockSubscribe.mock.calls.length).toBeGreaterThan(callCount);
        scope.stop();
    });

    it("runs once (no watch) when deps is omitted and honours initialValue", () => {
        const querier = vi.fn(() => Promise.resolve("data"));
        const scope = effectScope();
        let resultRef: any;
        scope.run(() => {
            resultRef = useDexieLiveQuery(querier, { initialValue: "init" });
        });

        expect(resultRef.value).toBe("init");
        expect(liveQuery).toHaveBeenCalledTimes(1);
        scope.stop();
    });

    it("retries after 100ms on error when deps are provided", async () => {
        const dep = ref("a");
        const onError = vi.fn();
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQuery(() => Promise.resolve("data"), { deps: dep, onError });
        });

        await nextTick();
        const callCount = mockSubscribe.mock.calls.length;

        const { error } = mockSubscribe.mock.calls.at(-1)![0];
        error(new Error("transient"));
        expect(onError).toHaveBeenCalled();

        await new Promise((r) => setTimeout(r, 150));
        expect(mockSubscribe.mock.calls.length).toBeGreaterThan(callCount);
        scope.stop();
    });

    it("deprecated useDexieLiveQueryWithDeps delegates to useDexieLiveQuery", async () => {
        const dep = ref("x");
        const scope = effectScope();
        let resultRef: any;
        scope.run(() => {
            resultRef = useDexieLiveQueryWithDeps(dep, (v: string) => Promise.resolve(v), {
                initialValue: "init",
            });
        });

        expect(resultRef.value).toBe("init");
        await nextTick();
        expect(liveQuery).toHaveBeenCalled();

        // Emits propagate through to the ref.
        const { next } = mockSubscribe.mock.calls.at(-1)![0];
        next("updated");
        expect(resultRef.value).toBe("updated");

        // Re-subscribes on dep change — proving it routed through the deps/watch path.
        const callCount = mockSubscribe.mock.calls.length;
        dep.value = "y";
        await nextTick();
        expect(mockSubscribe.mock.calls.length).toBeGreaterThan(callCount);
        scope.stop();
    });
});

describe("useDexieLiveQuery retry-timer cleanup", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSubscribe.mockReturnValue({ unsubscribe: mockUnsubscribe });
    });

    it("does not re-subscribe after scope dispose (pending retry is cancelled)", async () => {
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQuery(() => Promise.resolve("data"));
        });

        const { error } = mockSubscribe.mock.calls[0][0];
        const countBefore = mockSubscribe.mock.calls.length;

        error(new Error("boom")); // schedules a 100ms retry
        scope.stop(); // cleanup() must clear the retry timer

        await new Promise((r) => setTimeout(r, 150));
        expect(mockSubscribe.mock.calls.length).toBe(countBefore);
    });

    it("does not re-subscribe with stale data after a deps change (pending retry is cancelled)", async () => {
        const dep = ref("a");
        const scope = effectScope();
        scope.run(() => {
            useDexieLiveQuery((v: string) => Promise.resolve(v), { deps: dep });
        });

        await nextTick();
        const { error } = mockSubscribe.mock.calls.at(-1)![0];

        error(new Error("boom")); // schedules a 100ms retry with the stale "a" data
        dep.value = "b"; // watch -> start("b") must clear the stale retry
        await nextTick();

        const countAfterChange = mockSubscribe.mock.calls.length;
        await new Promise((r) => setTimeout(r, 150));
        expect(mockSubscribe.mock.calls.length).toBe(countAfterChange);
        scope.stop();
    });
});
