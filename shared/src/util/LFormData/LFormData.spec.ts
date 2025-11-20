import { describe, it, expect } from "vitest";
import { LFormData } from "./LFormData";

function getFormDataEntries(formData: FormData) {
    const entries: Record<string, any> = {};
    for (const [key, value] of (formData as any).entries()) {
        entries[key] = value;
    }
    return entries;
}

describe("LFormData", () => {
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

        // Check JSON key format
        expect(entries["galleryDoc__json"]).toBeDefined();

        const jsonData = JSON.parse(entries["galleryDoc__json"]);

        // Check that placeholders are created (with __fileId and __path)
        expect(jsonData.images).toHaveLength(2);
        expect(jsonData.images[0]).toHaveProperty("__fileId");
        expect(jsonData.images[0]).toHaveProperty("__path");
        expect(Array.isArray(jsonData.images[0].__path)).toBe(true);
        expect(jsonData.images[1]).toHaveProperty("__fileId");
        expect(jsonData.images[1]).toHaveProperty("__path");
        expect(jsonData.label).toBe("gallery");

        // Check file keys format: galleryDoc__file__0, galleryDoc__file__1
        expect(entries["galleryDoc__file__0"]).toBeDefined();
        expect(entries["galleryDoc__file__0"]).toHaveProperty("size");
        expect(entries["galleryDoc__file__0"]).toHaveProperty("type");
        expect(entries["galleryDoc__file__1"]).toBeDefined();
        expect(entries["galleryDoc__file__1"]).toHaveProperty("size");
        expect(entries["galleryDoc__file__1"]).toHaveProperty("type");

        // Check metadata keys format: galleryDoc__file__0__meta, galleryDoc__file__1__meta
        expect(entries["galleryDoc__file__0__meta"]).toBeDefined();
        const meta0 = JSON.parse(entries["galleryDoc__file__0__meta"]);
        expect(meta0.filename).toBe("a.webp");
        expect(meta0.width).toBe(100);
        expect(meta0.height).toBe(80);

        expect(entries["galleryDoc__file__1__meta"]).toBeDefined();
        const meta1 = JSON.parse(entries["galleryDoc__file__1__meta"]);
        expect(meta1.filename).toBe("b.webp");
        expect(meta1.width).toBe(200);
        expect(meta1.height).toBe(160);
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

        // Check JSON key format
        expect(entries["coverDoc__json"]).toBeDefined();
        const jsonData = JSON.parse(entries["coverDoc__json"]);

        // Check that placeholder is created with __fileId and __path
        expect(jsonData.image).toHaveProperty("__fileId");
        expect(jsonData.image).toHaveProperty("__path");
        expect(Array.isArray(jsonData.image.__path)).toBe(true);
        expect(jsonData.meta).toEqual({ author: "Jane" });
        expect(jsonData.tag).toBe("cover");

        // Check file key format
        expect(entries["coverDoc__file__0"]).toBeDefined();
        expect(entries["coverDoc__file__0"]).toHaveProperty("size");
        expect(entries["coverDoc__file__0"]).toHaveProperty("type");

        // Check metadata key format - metadata should contain fields from the object containing the binary
        expect(entries["coverDoc__file__0__meta"]).toBeDefined();
        const metadata = JSON.parse(entries["coverDoc__file__0__meta"]);
        // Metadata comes from the object containing the binary (image object), not the parent
        expect(metadata.filename).toBe("nested.webp");
        expect(metadata.width).toBe(300);
        expect(metadata.height).toBe(200);
        // But should not include the binary field
        expect(metadata.fileData).toBeUndefined();
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
        expect(jsonData.fileData).toHaveProperty("__fileId");
        expect(jsonData.fileData).toHaveProperty("__path");
        expect(jsonData.preset).toBe("default");

        expect(entries["rootDoc__file__0"]).toBeDefined();
        expect(entries["rootDoc__file__0__meta"]).toBeDefined();
        const metadata = JSON.parse(entries["rootDoc__file__0__meta"]);
        expect(metadata.preset).toBe("default");
        expect(metadata.fileData).toBeUndefined();
    });

    it("handles empty metadata correctly", () => {
        const img = new File(["img"], "empty.webp", { type: "image/webp" });
        const form = new LFormData();
        form.append("emptyDoc", { fileData: img });
        const entries = getFormDataEntries(form);

        expect(entries["emptyDoc__file__0__meta"]).toBeDefined();
        const metadata = JSON.parse(entries["emptyDoc__file__0__meta"]);
        expect(metadata).toEqual({});
    });

    it("handles ArrayBuffer binary data", () => {
        const buffer = new ArrayBuffer(8);
        const view = new Uint8Array(buffer);
        view[0] = 0x89; // PNG signature
        view[1] = 0x50;

        const form = new LFormData();
        form.append("bufferDoc", { fileData: buffer, type: "png" });
        const entries = getFormDataEntries(form);

        expect(entries["bufferDoc__file__0"]).toBeDefined();
        expect(entries["bufferDoc__file__0"]).toHaveProperty("size");
        expect(entries["bufferDoc__file__0__meta"]).toBeDefined();
        const metadata = JSON.parse(entries["bufferDoc__file__0__meta"]);
        expect(metadata.type).toBe("png");
    });
});
