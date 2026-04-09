import { isDangerousKey, removeDangerousKeys } from "./removeDangerousKeys";

describe("removeDangerousKeys", () => {
    describe("isDangerousKey", () => {
        it("should return true for __proto__", () => {
            expect(isDangerousKey("__proto__")).toBe(true);
        });

        it("should return true for constructor", () => {
            expect(isDangerousKey("constructor")).toBe(true);
        });

        it("should return true for prototype", () => {
            expect(isDangerousKey("prototype")).toBe(true);
        });

        it("should return false for safe keys", () => {
            expect(isDangerousKey("name")).toBe(false);
            expect(isDangerousKey("__data__")).toBe(false);
        });
    });

    describe("removeDangerousKeys", () => {
        it("should remove dangerous keys from object", () => {
            // Use an object with 'constructor' as a regular key
            const obj = { name: "test", constructor: { bad: true }, safe: "value" };
            const result = removeDangerousKeys(obj);
            expect(result.name).toBe("test");
            expect(result.safe).toBe("value");
            expect(Object.keys(result)).toEqual(["name", "safe"]);
        });

        it("should remove prototype key from object", () => {
            const obj = { name: "test", prototype: { x: 1 } };
            const result = removeDangerousKeys(obj);
            expect(result.name).toBe("test");
            expect(Object.keys(result)).toEqual(["name"]);
        });

        it("should handle nested dangerous keys", () => {
            const obj = { data: { constructor: { x: 1 }, safe: "value" } };
            const result = removeDangerousKeys(obj);
            expect(result.data.safe).toBe("value");
            expect(Object.keys(result.data)).toEqual(["safe"]);
        });

        it("should handle arrays", () => {
            const result = removeDangerousKeys([{ name: "test" }, { other: "val" }]);
            expect(result).toEqual([{ name: "test" }, { other: "val" }]);
        });

        it("should return primitives unchanged", () => {
            expect(removeDangerousKeys("string")).toBe("string");
            expect(removeDangerousKeys(42)).toBe(42);
            expect(removeDangerousKeys(null)).toBe(null);
            expect(removeDangerousKeys(undefined)).toBe(undefined);
        });
    });
});
