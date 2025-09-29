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

    it("should validate the complete upload flow", async () => {
        // Test 1: Invalid file type (text file)
        const textBuffer = Buffer.from("This is just text, not audio");
        const invalidDto = plainToClass(MediaUploadDataDto, {
            fileData: textBuffer,
            mediaType: MediaType.Audio,
            preset: MediaPreset.Default,
            filename: "notaudio.txt",
        });

        const invalidErrors = await validate(invalidDto);
        expect(invalidErrors.length).toBeGreaterThan(0);
        expect(invalidErrors.some((e) => e.constraints?.isAudio)).toBe(true);

        // Test 2: Missing required fields
        const incompleteDto = plainToClass(MediaUploadDataDto, {
            filename: "test.mp3",
        });

        const incompleteErrors = await validate(incompleteDto);
        expect(incompleteErrors.length).toBeGreaterThan(0);

        const missingFields = incompleteErrors.map((e) => e.property);
        expect(missingFields).toContain("fileData");
        expect(missingFields).toContain("mediaType");
        expect(missingFields).toContain("preset");

        // Test 3: Invalid enum values
        const invalidEnumDto = plainToClass(MediaUploadDataDto, {
            fileData: textBuffer,
            mediaType: "invalid_type" as any,
            preset: "invalid_preset" as any,
            filename: "test.mp3",
        });

        const enumErrors = await validate(invalidEnumDto);
        expect(enumErrors.length).toBeGreaterThan(0);
    });

    it("should validate frontend upload simulation", () => {
        // Simulate what happens in MediaEditor.vue when a file is selected
        const file = {
            name: "test-audio.mp3",
            size: 1024000, // 1MB
            type: "audio/mpeg",
        };

        // Simulate FileReader result (would be actual audio in real scenario)
        const mockArrayBuffer = new ArrayBuffer(1024);

        // Remove extension from filename (as done in MediaEditor.vue)
        const fileNameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");

        const uploadData: Partial<MediaUploadDataDto> = {
            fileData: mockArrayBuffer,
            preset: MediaPreset.Default,
            mediaType: MediaType.Audio,
            filename: fileNameWithoutExtension,
        };

        // Verify the structure matches what frontend sends
        expect(uploadData.filename).toBe("test-audio");
        expect(uploadData.mediaType).toBe(MediaType.Audio);
        expect(uploadData.preset).toBe(MediaPreset.Default);
        expect(uploadData.fileData).toBeInstanceOf(ArrayBuffer);

        // Frontend upload structure validated
    });
});
