import { renditionSizesForWidth } from "./processImageDto";

describe("renditionSizesForWidth", () => {
    it("includes the 960 rendition and no 1280 for a 1000px source", () => {
        expect(renditionSizesForWidth(1000)).toEqual([180, 360, 640, 960]);
    });

    it("includes 1280 from the 10% upscaling tolerance (1164px)", () => {
        expect(renditionSizesForWidth(1163)).toEqual([180, 360, 640, 960]);
        expect(renditionSizesForWidth(1164)).toEqual([180, 360, 640, 960, 1280]);
    });
});
