jest.mock("file-type");

import { detectFileType } from "./fileTypeDetection";

describe("detectFileType", () => {
    let fileTypeFromBuffer: jest.Mock;

    beforeEach(async () => {
        const ft = await import("file-type");
        fileTypeFromBuffer = ft.fileTypeFromBuffer as jest.Mock;
        fileTypeFromBuffer.mockReset();
    });

    it("should return detected file type for a known buffer", async () => {
        fileTypeFromBuffer.mockResolvedValue({ ext: "jpg", mime: "image/jpeg" });
        const buffer = new Uint8Array([0xff, 0xd8, 0xff]);
        const result = await detectFileType(buffer);

        expect(result).toEqual({ ext: "jpg", mime: "image/jpeg" });
        expect(fileTypeFromBuffer).toHaveBeenCalledWith(buffer);
    });

    it("should return undefined for an unrecognized buffer", async () => {
        fileTypeFromBuffer.mockResolvedValue(undefined);
        const buffer = new Uint8Array([0x00, 0x01, 0x02]);
        const result = await detectFileType(buffer);

        expect(result).toBeUndefined();
    });

    it("should return undefined for an empty buffer", async () => {
        fileTypeFromBuffer.mockResolvedValue(undefined);
        const buffer = new Uint8Array([]);
        const result = await detectFileType(buffer);

        expect(result).toBeUndefined();
    });
});
