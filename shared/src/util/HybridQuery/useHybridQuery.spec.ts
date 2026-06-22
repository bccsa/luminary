import { describe, it, expect, vi, beforeEach } from "vitest";
import { effectScope, isRef } from "vue";

// Mock the HybridQuery class with a lightweight fake that reproduces the only two
// behaviours the composable depends on: it exposes an `output` ref, and it
// registers `onScopeDispose` in its constructor (the real auto-teardown wiring).
const mocks = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { shallowRef, computed, ref, getCurrentScope, onScopeDispose } = require("vue");
    const ctorCalls: Array<{ query: any; options: any }> = [];
    const disposeSpy = vi.fn();
    class FakeHybridQuery {
        output = shallowRef<any[]>([]);
        _localPending = ref(true);
        isFetching = computed(() => this._localPending.value);
        error = shallowRef<unknown | undefined>(undefined);
        constructor(query: any, options: any) {
            ctorCalls.push({ query, options });
            if (getCurrentScope()) onScopeDispose(() => this.dispose());
        }
        dispose() {
            disposeSpy();
        }
    }
    return { ctorCalls, disposeSpy, FakeHybridQuery };
});

vi.mock("./HybridQuery", () => ({ HybridQuery: mocks.FakeHybridQuery }));

import { useHybridQuery, useHybridQueryWithState } from "./useHybridQuery";

describe("useHybridQuery", () => {
    beforeEach(() => {
        mocks.ctorCalls.length = 0;
        mocks.disposeSpy.mockClear();
    });

    it("constructs HybridQuery with the query + options and returns its output ref", () => {
        const query = { selector: { type: "content" } };
        const out = useHybridQuery(query, { live: true });

        expect(mocks.ctorCalls).toEqual([{ query, options: { live: true } }]);
        expect(isRef(out)).toBe(true);
        expect(out.value).toEqual([]);
    });

    it("forwards undefined options when none are passed", () => {
        useHybridQuery({ selector: { type: "content" } });
        expect(mocks.ctorCalls[0]!.options).toBeUndefined();
    });

    it("forwards persistOffline: true through to the HybridQuery constructor", () => {
        const query = { selector: { type: "content" } };
        useHybridQuery(query, { persistOffline: true });

        expect(mocks.ctorCalls).toEqual([{ query, options: { persistOffline: true } }]);
    });

    it("forwards cacheStripFields through to the HybridQuery constructor", () => {
        const query = { selector: { type: "content" } };
        useHybridQuery(query, { cache: true, cacheStripFields: ["fts", "text"] });

        expect(mocks.ctorCalls).toEqual([
            { query, options: { cache: true, cacheStripFields: ["fts", "text"] } },
        ]);
    });

    it("auto-disposes the instance when the owning effect scope stops", () => {
        const scope = effectScope();
        scope.run(() => {
            useHybridQuery({ selector: { type: "content" } });
        });
        expect(mocks.disposeSpy).not.toHaveBeenCalled();

        scope.stop(); // mimics component unmount
        expect(mocks.disposeSpy).toHaveBeenCalledTimes(1);
    });

    it("does not throw (and registers no disposal) outside an effect scope", () => {
        expect(() => useHybridQuery({ selector: { type: "content" } })).not.toThrow();
        expect(mocks.disposeSpy).not.toHaveBeenCalled();
    });
});

describe("useHybridQueryWithState", () => {
    beforeEach(() => {
        mocks.ctorCalls.length = 0;
        mocks.disposeSpy.mockClear();
    });

    it("constructs HybridQuery with the query + options and returns { output, isFetching, error }", () => {
        const query = { selector: { type: "content" } };
        const { output, isFetching, error } = useHybridQueryWithState(query, { live: true });

        expect(mocks.ctorCalls).toEqual([{ query, options: { live: true } }]);
        expect(isRef(output)).toBe(true);
        expect(isRef(isFetching)).toBe(true);
        expect(isRef(error)).toBe(true);
        expect(output.value).toEqual([]);
        expect(isFetching.value).toBe(true);
        expect(error.value).toBeUndefined();
    });

    it("useHybridQuery delegates to the same construction path (single instance, output only)", () => {
        const query = { selector: { type: "content" } };
        const out = useHybridQuery(query, { cache: true });

        // One construction, identical to what the stateful form would do.
        expect(mocks.ctorCalls).toEqual([{ query, options: { cache: true } }]);
        expect(isRef(out)).toBe(true);
    });

    it("auto-disposes the instance when the owning effect scope stops", () => {
        const scope = effectScope();
        scope.run(() => {
            useHybridQueryWithState({ selector: { type: "content" } });
        });
        expect(mocks.disposeSpy).not.toHaveBeenCalled();

        scope.stop();
        expect(mocks.disposeSpy).toHaveBeenCalledTimes(1);
    });
});
