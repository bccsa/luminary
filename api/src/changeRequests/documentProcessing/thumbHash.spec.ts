import { generateThumbHash, rgbaToThumbHash } from "./thumbHash";
import * as sharp from "sharp";

describe("thumbHash", () => {
    it("rgbaToThumbHash produces a deterministic, non-empty hash", () => {
        const w = 4;
        const h = 4;
        const rgba = new Uint8Array(w * h * 4);
        for (let i = 0; i < rgba.length; i += 4) {
            rgba[i] = 200;
            rgba[i + 1] = 100;
            rgba[i + 2] = 50;
            rgba[i + 3] = 255;
        }
        const a = rgbaToThumbHash(w, h, rgba);
        const b = rgbaToThumbHash(w, h, rgba);
        expect(a).toBeInstanceOf(Uint8Array);
        expect(a.length).toBeGreaterThan(4);
        expect(Buffer.from(a).toString("base64")).toBe(Buffer.from(b).toString("base64"));
    });

    it("rejects images larger than 100x100", () => {
        expect(() => rgbaToThumbHash(101, 10, new Uint8Array(101 * 10 * 4))).toThrow();
    });

    it("generateThumbHash returns a base64 hash for a real image buffer", async () => {
        const img = await sharp({
            create: {
                width: 20,
                height: 12,
                channels: 4,
                background: { r: 10, g: 120, b: 200, alpha: 1 },
            },
        })
            .png()
            .toBuffer();

        const hash = await generateThumbHash(img);
        expect(typeof hash).toBe("string");
        expect(Buffer.from(hash as string, "base64").length).toBeGreaterThanOrEqual(5);
    });

    it("returns undefined for invalid input instead of throwing", async () => {
        const hash = await generateThumbHash(Buffer.from("not an image"));
        expect(hash).toBeUndefined();
    });
});
