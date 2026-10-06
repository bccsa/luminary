import { patchFileData } from "./patchFileData";

describe("patchFileData", () => {
    it("should patch binary references with file buffers", () => {
        const fileMap = new Map<string, Buffer>();
        fileMap.set("changes__file__img1", Buffer.from("image-data"));

        const obj = { image: "BINARY_REF-img1", title: "test" };
        const stats = patchFileData(obj, fileMap, "changes");

        expect(obj.image).toEqual(Buffer.from("image-data"));
        expect(obj.title).toBe("test");
        expect(stats.found).toBe(1);
        expect(stats.patched).toBe(1);
        expect(stats.missingIds).toHaveLength(0);
    });

    it("should track missing file IDs", () => {
        const fileMap = new Map<string, Buffer>();
        const obj = { image: "BINARY_REF-missing1" };
        const stats = patchFileData(obj, fileMap, "changes");

        expect(stats.found).toBe(1);
        expect(stats.patched).toBe(0);
        expect(stats.missingIds).toEqual(["missing1"]);
        expect(obj.image).toBe("BINARY_REF-missing1");
    });

    it("should handle nested objects", () => {
        const fileMap = new Map<string, Buffer>();
        fileMap.set("changes__file__f1", Buffer.from("nested-data"));

        const obj = { nested: { file: "BINARY_REF-f1" } };
        const stats = patchFileData(obj, fileMap, "changes");

        expect(obj.nested.file as any).toEqual(Buffer.from("nested-data"));
        expect(stats.patched).toBe(1);
    });

    it("should handle arrays with binary references", () => {
        const fileMap = new Map<string, Buffer>();
        fileMap.set("changes__file__a1", Buffer.from("arr-data"));

        const obj = { files: ["BINARY_REF-a1", "normal-string"] };
        const stats = patchFileData(obj, fileMap, "changes");

        expect(obj.files[0]).toEqual(Buffer.from("arr-data"));
        expect(obj.files[1]).toBe("normal-string");
        expect(stats.patched).toBe(1);
    });

    it("should skip dangerous keys", () => {
        const fileMap = new Map<string, Buffer>();
        const obj = JSON.parse('{"safe": "value", "__proto__": {"bad": true}}');
        patchFileData(obj, fileMap, "changes");

        expect(obj.safe).toBe("value");
        expect(Object.getOwnPropertyNames(obj)).not.toContain("__proto__");
    });

    it("should handle null and primitive values", () => {
        const fileMap = new Map<string, Buffer>();
        const obj = { a: null, b: 42, c: true };
        const stats = patchFileData(obj, fileMap, "changes");

        expect(obj.a).toBeNull();
        expect(obj.b).toBe(42);
        expect(stats.found).toBe(0);
    });
});
