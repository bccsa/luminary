import { describe, expect, it } from "vitest";
import { installPolyfills } from "./polyfills";

type Polyfilled = {
    hasOwn: (obj: object, key: PropertyKey) => boolean;
    at: (this: ArrayLike<unknown>, index: number) => unknown;
};

// Stand-ins for Chromium 92's Object and prototypes, so the real globals stay untouched
function install(): Polyfilled {
    const object = {};
    const proto = {};
    installPolyfills({ object, atProtos: [proto] });
    return {
        hasOwn: (object as Polyfilled).hasOwn,
        at: (proto as Polyfilled).at,
    };
}

describe("installPolyfills", () => {
    it("adds hasOwn", () => {
        const { hasOwn } = install();
        class WithProto {
            inherited() {}
        }
        const obj = Object.assign(new WithProto(), { own: 1 });
        expect(hasOwn(obj, "own")).toBe(true);
        expect(hasOwn(obj, "inherited")).toBe(false);
        expect(hasOwn(Object.create(null), "x")).toBe(false);
    });

    it("adds at, counting negative indexes from the end", () => {
        const { at } = install();
        expect(at.call([1, 2, 3], -1)).toBe(3);
        expect(at.call([1, 2, 3], 0)).toBe(1);
        expect(at.call([1, 2, 3], 3)).toBeUndefined();
        expect(at.call([1, 2, 3], -4)).toBeUndefined();
        expect(at.call("abc", -1)).toBe("c");
        expect(at.call(new Uint8Array([7, 8]), -1)).toBe(8);
    });

    it("adds them non-enumerable", () => {
        const object = {};
        installPolyfills({ object, atProtos: [] });
        expect(Object.keys(object)).toEqual([]);
    });

    it("keeps a native implementation", () => {
        const native = () => true;
        const object = { hasOwn: native };
        installPolyfills({ object, atProtos: [] });
        expect(object.hasOwn).toBe(native);
    });
});
