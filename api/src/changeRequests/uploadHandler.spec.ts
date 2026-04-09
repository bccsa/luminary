import { MediaType } from "../enums";
import { createUploadData } from "./uploadHandler";

describe("createUploadData", () => {
    const mockFile = {
        buffer: Buffer.from("test-data"),
    } as any;

    it("should include preset and fileData for all uploads", () => {
        const result = createUploadData(mockFile, "default", {});
        expect(result.preset).toBe("default");
        expect(result.fileData).toBe(mockFile.buffer);
    });

    it("should include mediaType and languageId when mediaType is provided", () => {
        const result = createUploadData(mockFile, "speech", {
            mediaType: MediaType.Audio,
            languageId: "lang-1",
        });
        expect(result.mediaType).toBe(MediaType.Audio);
        expect(result.languageId).toBe("lang-1");
        expect(result.hlsUrl).toBeUndefined();
    });

    it("should include all media fields when mediaType, hlsUrl, and languageId are provided", () => {
        const result = createUploadData(mockFile, "default", {
            mediaType: MediaType.Video,
            hlsUrl: "https://example.com/stream.m3u8",
            languageId: "lang-2",
        });
        expect(result.hlsUrl).toBe("https://example.com/stream.m3u8");
        expect(result.mediaType).toBe(MediaType.Video);
        expect(result.languageId).toBe("lang-2");
    });

    it("should not include hlsUrl when mediaType is absent even if hlsUrl is provided", () => {
        const result = createUploadData(mockFile, "default", {
            hlsUrl: "https://example.com/stream.m3u8",
        });
        expect(result.hlsUrl).toBeUndefined();
        expect(result.mediaType).toBeUndefined();
    });

    it("should not include mediaType fields when mediaType is not provided", () => {
        const result = createUploadData(mockFile, "music", { languageId: "lang-1" });
        expect(result.mediaType).toBeUndefined();
        expect(result.languageId).toBeUndefined();
        expect(result.preset).toBe("music");
    });
});
