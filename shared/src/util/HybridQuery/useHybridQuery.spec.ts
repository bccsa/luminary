import { describe, it, expect, vi, beforeEach } from "vitest";
import { effectScope, isRef } from "vue";

// Mock the HybridQuery class with a lightweight fake that reproduces the only two
// behaviours the composable depends on: it exposes an `output` ref, and it
// registers `onScopeDispose` in its constructor (the real auto-teardown wiring).
const mocks = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { shallowRef, getCurrentScope, onScopeDispose } = require("vue");
    const ctorCalls: Array<{ query: any; options: any }> = [];
    const disposeSpy = vi.fn();
    class FakeHybridQuery {
        output = shallowRef<any[]>([]);
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

import { useHybridQuery } from "./useHybridQuery";

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
