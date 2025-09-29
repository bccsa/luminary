import { validate } from "class-validator";
import { plainToClass } from "class-transformer";
import { MediaUploadDataDto } from "./MediaUploadDataDto";
import { MediaType, MediaPreset } from "../enums";

describe("MediaUploadDataDto Validation", () => {
    it("should reject non-audio file data", async () => {
        // Create invalid audio data (just text)
        const invalidBuffer = Buffer.from("This is not audio data");

        const dto = plainToClass(MediaUploadDataDto, {
            fileData: invalidBuffer,
            mediaType: MediaType.Audio,
            preset: MediaPreset.Default,
            filename: "fake.mp3",
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].constraints?.isAudio).toContain("must be a valid audio file");
    });

    it("should reject missing required fields", async () => {
        const dto = plainToClass(MediaUploadDataDto, {
            // Missing fileData, mediaType, preset
            filename: "test.mp3",
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);

        // Should have errors for missing required fields
        const fieldErrors = errors.map((e) => e.property);

        expect(fieldErrors).toContain("fileData");
        expect(fieldErrors).toContain("mediaType");
        expect(fieldErrors).toContain("preset");
    });

    it("should accept valid MediaType and MediaPreset enums", async () => {
        // Just test the structure without audio validation for now
        const fakeBuffer = Buffer.from("fake");

        const dto = plainToClass(MediaUploadDataDto, {
            fileData: fakeBuffer,
            mediaType: MediaType.Audio,
            preset: MediaPreset.Default,
            filename: "test.wav",
        });

        // Should only fail on audio validation, not on required fields
        const errors = await validate(dto);
        expect(errors.length).toBe(1); // Only the IsAudio constraint should fail
        expect(errors[0].property).toBe("fileData");
        expect(errors[0].constraints?.isAudio).toBeDefined();
    });
});
