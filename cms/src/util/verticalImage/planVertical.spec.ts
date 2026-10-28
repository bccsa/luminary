import { describe, expect, it } from "vitest";
import { planVertical, subjectWindow, type RgbaImage } from "./planVertical";

/** A flat grey image with a checkerboard (lots of detail) between the given columns/rows. */
function image(
    width: number,
    height: number,
    detail: { x0: number; x1: number; y0?: number; y1?: number },
): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4);
    const { x0, x1, y0 = 0, y1 = height } = detail;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
            const v = inside ? ((x + y) % 2 ? 255 : 0) : 128;
            data.set([v, v, v, 255], (y * width + x) * 4);
        }
    }
    return { data, width, height };
}

const source = { width: 1600, height: 900 };

describe("planVertical", () => {
    it("crops around a narrow subject", () => {
        const plan = planVertical(image(160, 90, { x0: 100, x1: 120 }), source);

        expect(plan.strategy).toBe("crop");
        expect(plan).toMatchObject({ width: 1080, height: 1440 });
        expect(plan.cropBox).toMatchObject({ top: 0, width: 675, height: 900 });
        // The subject (source x 1000..1200) sits inside the crop.
        expect(plan.cropBox.left).toBeLessThanOrEqual(1000);
        expect(plan.cropBox.left + plan.cropBox.width).toBeGreaterThanOrEqual(1200);
        expect(plan.placement).toEqual({ left: 0, top: 0, width: 1080, height: 1440 });
    });

    it("clamps the crop to the image edge", () => {
        const plan = planVertical(image(160, 90, { x0: 0, x1: 8 }), source);

        expect(plan.strategy).toBe("crop");
        expect(plan.cropBox.left).toBe(0);
    });

    it("blur-fills a subject wider than a 3:4 crop, without stretching it", () => {
        const plan = planVertical(image(160, 90, { x0: 10, x1: 150 }), source);

        expect(plan.strategy).toBe("blur-fill");
        expect(plan.cropBox.left).toBeLessThanOrEqual(100);
        expect(plan.cropBox.left + plan.cropBox.width).toBeGreaterThanOrEqual(1500);
        expect(plan.placement.width / plan.placement.height).toBeCloseTo(
            plan.cropBox.width / plan.cropBox.height,
            1,
        );
        expect(plan.placement.height).toBeLessThan(1440);
        // Centred by default.
        expect(plan.placement.top).toBe(Math.round((1440 - plan.placement.height) / 2));
    });

    it("honours a forced strategy", () => {
        const wide = image(160, 90, { x0: 10, x1: 150 });
        expect(planVertical(wide, source, { strategy: "crop" }).strategy).toBe("crop");

        const forced = planVertical(image(160, 90, { x0: 100, x1: 120 }), source, {
            strategy: "blur-fill",
        });
        expect(forced.strategy).toBe("blur-fill");
        // A narrow subject is widened to a full-height crop, so it still fills the output.
        expect(forced.cropBox.width).toBe(675);
        expect(forced.placement.height).toBe(1440);
    });

    it("places the photo by verticalPosition", () => {
        const wide = image(160, 90, { x0: 10, x1: 150 });
        expect(planVertical(wide, source, { verticalPosition: 0 }).placement.top).toBe(0);
        const bottom = planVertical(wide, source, { verticalPosition: 1 }).placement;
        expect(bottom.top + bottom.height).toBe(1440);
    });

    it("only trims the height of an already tall source", () => {
        const tall = { width: 900, height: 1600 };
        const plan = planVertical(image(90, 160, { x0: 0, x1: 90, y0: 10, y1: 30 }), tall);

        expect(plan.strategy).toBe("crop");
        expect(plan.cropBox).toEqual({ left: 0, top: 0, width: 900, height: 1200 });
    });
});

describe("subjectWindow", () => {
    it("finds the narrowest run holding the share", () => {
        expect(subjectWindow([0, 0, 10, 10, 0, 0], 0.9)).toEqual([2, 4]);
    });

    it("spans everything when the profile is flat", () => {
        expect(subjectWindow([5, 5, 5, 5], 0.85)).toEqual([0, 4]);
    });
});
