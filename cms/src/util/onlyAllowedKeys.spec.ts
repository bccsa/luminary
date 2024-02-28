import { describe, it, expect } from "vitest";
import { onlyAllowedKeys } from "./onlyAllowedKeys";

describe("onlyAllowedKeys", () => {
    it("reduces an object to only the allowed keys", () => {
        const originalObject = {
            foo: "Test",
            bar: 123,
            baz: {
                foo: "Test",
            },
            darth: {
                vader: 42,
            },
        };
        const allowed = ["foo", "bar", "darth"];

        const result: any = onlyAllowedKeys(originalObject, allowed);

        expect(Object.keys(result).length).toBe(3);
        expect(result.foo).toBe("Test");
        expect(result.bar).toBe(123);
        expect(result.darth.vader).toBe(42);
    });
});
