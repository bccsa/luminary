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

        // Check first file (no path field anymore - files are patched back in order)
        expect(entries["0-galleryDoc-files-fileData"]).toBeDefined();
        expect(entries["0-galleryDoc-files-fileData"]).toHaveProperty("size");
        expect(entries["0-galleryDoc-files-fileData"]).toHaveProperty("type");
        expect(entries["0-galleryDoc-files-filename"]).toBe("a.webp");
        expect(entries["0-galleryDoc-files-width"]).toBe("100");
        expect(entries["0-galleryDoc-files-height"]).toBe("80");

        // Check second file
        expect(entries["1-galleryDoc-files-fileData"]).toHaveProperty("size");
        expect(entries["1-galleryDoc-files-fileData"]).toHaveProperty("type");
        expect(entries["1-galleryDoc-files-filename"]).toBe("b.webp");
        expect(entries["1-galleryDoc-files-width"]).toBe("200");
        expect(entries["1-galleryDoc-files-height"]).toBe("160");

<<<<<<< HEAD
        // The JSON has null placeholders where binary data was extracted
        expect(entries["galleryDoc-JSON"]).toBe(
            JSON.stringify({ images: [null, null], label: "gallery" }),
        );
=======
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
>>>>>>> 81f582e5 (refactor: Update ChangeRequestController and LFormData to use binary references for file handling)
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

        // No path field - binary data is replaced with null and patched back in order on API side
        expect(entries["0-coverDoc-files-fileData"]).toHaveProperty("size");
        expect(entries["0-coverDoc-files-fileData"]).toHaveProperty("type");
        expect(entries["0-coverDoc-files-filename"]).toBe("nested.webp");
        expect(entries["0-coverDoc-files-width"]).toBe("300");
        expect(entries["0-coverDoc-files-height"]).toBe("200");

<<<<<<< HEAD
        // The JSON has null placeholder where image was, but preserves other fields
        expect(entries["coverDoc-JSON"]).toBe(
            JSON.stringify({ meta: { author: "Jane" }, image: null, tag: "cover" }),
        );
=======
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
>>>>>>> 81f582e5 (refactor: Update ChangeRequestController and LFormData to use binary references for file handling)
    });

    it("does not mutate the original object", () => {
        const img = new File(["img"], "orig.webp", { type: "image/webp" });
        const obj = { fileData: img, filename: "orig.webp", width: 50, height: 50 };
        const objCopy = { ...obj };
        const form = new LFormData();
        form.append("imgDoc", obj);
        expect(obj).toEqual(objCopy);
    });
<<<<<<< HEAD
=======

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
>>>>>>> 81f582e5 (refactor: Update ChangeRequestController and LFormData to use binary references for file handling)
});
