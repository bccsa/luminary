import { describe, it, expect } from "vitest";
import { LFormData } from "./LFormData";

function getFormDataEntries(formData: FormData) {
    const entries: Record<string, any> = {};
    for (const [key, value] of (formData as any).entries()) {
        entries[key] = value;
    }
    return entries;
}

describe("LFormData (images)", () => {
    it("appends multiple image files from an array", () => {
        const img1 = new File(["a"], "a.webp", { type: "image/webp" });
        const img2 = new File(["b"], "b.webp", { type: "image/webp" });
        const obj = {
            images: [
                { fileData: img1, filename: "a.webp", width: 100, height: 80 },
                { fileData: img2, filename: "b.webp", width: 200, height: 160 },
            ],
            label: "gallery",
        };
        const form = new LFormData();
        form.append("galleryDoc", obj);
        const entries = getFormDataEntries(form);

        expect(entries["galleryDoc__json"]).toBeDefined();
        const jsonData = JSON.parse(entries["galleryDoc__json"]);

        // Check that binary references are created as strings
        expect(jsonData.images).toHaveLength(2);
        expect(typeof jsonData.images[0].fileData).toBe("string");
        expect(jsonData.images[0].fileData).toMatch(/^BINARY_REF-/);
        expect(jsonData.images[0].filename).toBe("a.webp");
        expect(jsonData.images[0].width).toBe(100);
        expect(jsonData.images[0].height).toBe(80);

        expect(typeof jsonData.images[1].fileData).toBe("string");
        expect(jsonData.images[1].fileData).toMatch(/^BINARY_REF-/);
        expect(jsonData.images[1].filename).toBe("b.webp");
        expect(jsonData.images[1].width).toBe(200);
        expect(jsonData.images[1].height).toBe(160);
        expect(jsonData.label).toBe("gallery");

        // Extract IDs from binary references
        const id0 = jsonData.images[0].fileData.replace("BINARY_REF-", "");
        const id1 = jsonData.images[1].fileData.replace("BINARY_REF-", "");

        // Check file keys format: galleryDoc__file__{id}
        expect(entries[`galleryDoc__file__${id0}`]).toBeDefined();
        expect(entries[`galleryDoc__file__${id0}`]).toHaveProperty("size");
        expect(entries[`galleryDoc__file__${id0}`]).toHaveProperty("type");
        expect(entries[`galleryDoc__file__${id1}`]).toBeDefined();
        expect(entries[`galleryDoc__file__${id1}`]).toHaveProperty("size");
        expect(entries[`galleryDoc__file__${id1}`]).toHaveProperty("type");
    });

    it("handles nested image files and preserves other fields", () => {
        const img = new File(["img"], "nested.webp", { type: "image/webp" });
        const obj = {
            meta: { author: "Jane" },
            image: { fileData: img, filename: "nested.webp", width: 300, height: 200 },
            tag: "cover",
        };
        const form = new LFormData();
        form.append("coverDoc", obj);
        const entries = getFormDataEntries(form);

        expect(entries["coverDoc__json"]).toBeDefined();
        const jsonData = JSON.parse(entries["coverDoc__json"]);

        // Check that binary reference is created as a string
        expect(typeof jsonData.image.fileData).toBe("string");
        expect(jsonData.image.fileData).toMatch(/^BINARY_REF-/);
        expect(jsonData.image.filename).toBe("nested.webp");
        expect(jsonData.image.width).toBe(300);
        expect(jsonData.image.height).toBe(200);
        expect(jsonData.meta).toEqual({ author: "Jane" });
        expect(jsonData.tag).toBe("cover");

        // Extract ID from binary reference
        const id = jsonData.image.fileData.replace("BINARY_REF-", "");

        // Check file key format: coverDoc__file__{id}
        expect(entries[`coverDoc__file__${id}`]).toBeDefined();
        expect(entries[`coverDoc__file__${id}`]).toHaveProperty("size");
        expect(entries[`coverDoc__file__${id}`]).toHaveProperty("type");
    });

    it("does not mutate the original object", () => {
        const img = new File(["img"], "orig.webp", { type: "image/webp" });
        const obj = { fileData: img, filename: "orig.webp", width: 50, height: 50 };
        const objCopy = { ...obj };
        const form = new LFormData();
        form.append("imgDoc", obj);
        expect(obj).toEqual(objCopy);
    });
    it("handles binary data at root level", () => {
        const img = new File(["root"], "root.webp", { type: "image/webp" });
        const form = new LFormData();
        form.append("rootDoc", { fileData: img, preset: "default" });
        const entries = getFormDataEntries(form);

        expect(entries["rootDoc__json"]).toBeDefined();
        const jsonData = JSON.parse(entries["rootDoc__json"]);
        expect(typeof jsonData.fileData).toBe("string");
        expect(jsonData.fileData).toMatch(/^BINARY_REF-/);
        expect(jsonData.preset).toBe("default");

        // Extract ID from binary reference
        const id = jsonData.fileData.replace("BINARY_REF-", "");

        expect(entries[`rootDoc__file__${id}`]).toBeDefined();
        expect(entries[`rootDoc__file__${id}`]).toHaveProperty("size");
        expect(entries[`rootDoc__file__${id}`]).toHaveProperty("type");
    });

    it("handles binary without other properties", () => {
        const img = new File(["img"], "empty.webp", { type: "image/webp" });
        const form = new LFormData();
        form.append("emptyDoc", { fileData: img });
        const entries = getFormDataEntries(form);

        const jsonData = JSON.parse(entries["emptyDoc__json"]);
        expect(typeof jsonData.fileData).toBe("string");
        expect(jsonData.fileData).toMatch(/^BINARY_REF-/);

        const id = jsonData.fileData.replace("BINARY_REF-", "");
        expect(entries[`emptyDoc__file__${id}`]).toBeDefined();
    });

    it("handles ArrayBuffer binary data", () => {
        const buffer = new ArrayBuffer(8);
        const view = new Uint8Array(buffer);
        view[0] = 0x89; // PNG signature
        view[1] = 0x50;

        const form = new LFormData();
        form.append("bufferDoc", { fileData: buffer, type: "png" });
        const entries = getFormDataEntries(form);

        const jsonData = JSON.parse(entries["bufferDoc__json"]);
        expect(typeof jsonData.fileData).toBe("string");
        expect(jsonData.fileData).toMatch(/^BINARY_REF-/);
        expect(jsonData.type).toBe("png");

        const id = jsonData.fileData.replace("BINARY_REF-", "");
        expect(entries[`bufferDoc__file__${id}`]).toBeDefined();
        expect(entries[`bufferDoc__file__${id}`]).toHaveProperty("size");
    });

    it("handles TypedArray (ArrayBufferView) binary data", () => {
        const typedArray = new Uint8Array([1, 2, 3, 4]);

        const form = new LFormData();
        form.append("typedDoc", { fileData: typedArray, label: "typed" });
        const entries = getFormDataEntries(form);

        const jsonData = JSON.parse(entries["typedDoc__json"]);
        expect(typeof jsonData.fileData).toBe("string");
        expect(jsonData.fileData).toMatch(/^BINARY_REF-/);
        expect(jsonData.label).toBe("typed");
    });

    it("appends primitive string value directly", () => {
        const form = new LFormData();
        form.append("apiVersion", "1.0.0");
        const entries = getFormDataEntries(form);
        expect(entries["apiVersion"]).toBe("1.0.0");
    });

    it("appends primitive number value as string", () => {
        const form = new LFormData();
        form.append("count", 42 as any);
        const entries = getFormDataEntries(form);
        expect(entries["count"]).toBe("42");
    });

    it("appends null value as string", () => {
        const form = new LFormData();
        form.append("field", null as any);
        const entries = getFormDataEntries(form);
        expect(entries["field"]).toBe("null");
    });

    it("merges primitive value into previously appended object", () => {
        const form = new LFormData();
        form.append("doc", { type: "post", title: "Hello" });

        // Now append a primitive — should merge into the previous object's JSON
        form.append("apiVersion", "1.0.0");
        const entries = getFormDataEntries(form);

        const jsonData = JSON.parse(entries["doc__json"]);
        expect(jsonData.type).toBe("post");
        expect(jsonData.title).toBe("Hello");
        expect(jsonData.apiVersion).toBe("1.0.0");

        // apiVersion should NOT appear as a separate entry
        expect(entries["apiVersion"]).toBeUndefined();
    });

    it("handles object with no binary data", () => {
        const form = new LFormData();
        form.append("doc", { title: "Hello", count: 5, active: true });
        const entries = getFormDataEntries(form);

        const jsonData = JSON.parse(entries["doc__json"]);
        expect(jsonData.title).toBe("Hello");
        expect(jsonData.count).toBe(5);
        expect(jsonData.active).toBe(true);
    });

    it("handles arrays with mixed content", () => {
        const img = new File(["x"], "x.webp", { type: "image/webp" });
        const form = new LFormData();
        form.append("doc", { items: [1, "text", img, null] });
        const entries = getFormDataEntries(form);

        const jsonData = JSON.parse(entries["doc__json"]);
        expect(jsonData.items[0]).toBe(1);
        expect(jsonData.items[1]).toBe("text");
        expect(typeof jsonData.items[2]).toBe("string");
        expect(jsonData.items[2]).toMatch(/^BINARY_REF-/);
        expect(jsonData.items[3]).toBeNull();
    });

    it("skips prototype pollution keys", () => {
        const obj = Object.create(null);
        obj.safe = "value";
        obj.__proto__ = "evil";
        obj.constructor = "evil";
        obj.prototype = "evil";

        const form = new LFormData();
        form.append("doc", obj);
        const entries = getFormDataEntries(form);

        const jsonData = JSON.parse(entries["doc__json"]);
        expect(jsonData.safe).toBe("value");
        // constructor and prototype should NOT be own properties (stripped by extractBinaries)
        expect(Object.prototype.hasOwnProperty.call(jsonData, "constructor")).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(jsonData, "prototype")).toBe(false);
    });

    it("handles Blob binary data at root level", () => {
        const blob = new Blob(["hello"], { type: "text/plain" });
        const form = new LFormData();
        form.append("doc", { data: blob });
        const entries = getFormDataEntries(form);

        const jsonData = JSON.parse(entries["doc__json"]);
        expect(jsonData.data).toMatch(/^BINARY_REF-/);
    });

    it("handles array with nested objects containing binaries", () => {
        const img = new File(["img"], "nested.webp", { type: "image/webp" });
        const form = new LFormData();
        form.append("doc", {
            items: [{ file: img, meta: { size: 100 } }],
        });
        const entries = getFormDataEntries(form);

        const jsonData = JSON.parse(entries["doc__json"]);
        expect(jsonData.items[0].file).toMatch(/^BINARY_REF-/);
        expect(jsonData.items[0].meta.size).toBe(100);
    });
});
