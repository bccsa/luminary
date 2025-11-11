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

        // The JSON has null placeholders where binary data was extracted
        expect(entries["galleryDoc-JSON"]).toBe(
            JSON.stringify({ images: [null, null], label: "gallery" }),
        );
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

        // The JSON has null placeholder where image was, but preserves other fields
        expect(entries["coverDoc-JSON"]).toBe(
            JSON.stringify({ meta: { author: "Jane" }, image: null, tag: "cover" }),
        );
    });

    it("does not mutate the original object", () => {
        const img = new File(["img"], "orig.webp", { type: "image/webp" });
        const obj = { fileData: img, filename: "orig.webp", width: 50, height: 50 };
        const objCopy = { ...obj };
        const form = new LFormData();
        form.append("imgDoc", obj);
        expect(obj).toEqual(objCopy);
    });
});
