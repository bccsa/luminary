import { processMedia } from "./s3.audiohandling";
import { S3AudioService } from "./s3Audio.service";
import { createTestingModule } from "../test/testingModule";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { MediaDto } from "../dto/MediaDto";
import { MediaPreset, MediaType } from "../enums";

describe("S3AudioHandler", () => {
    let service: S3AudioService;
    const resAudios: MediaDto[] = [];

    beforeAll(async () => {
        service = (await createTestingModule("audiohandling")).s3AudioService;
        service.audioBucket = uuidv4();
        await service.makeBucket(service.audioBucket);
    });

    afterAll(async () => {
        // Cleanup uploaded audio files
        const removeFiles = Array.from(
            new Set(
                resAudios.flatMap((r) =>
                    r.fileCollections.map((f) => f.fileUrl.split("/").pop()!).filter(Boolean),
                ),
            ),
        );
        if (removeFiles.length > 0) {
            try {
                await service.removeObjects(service.audioBucket, removeFiles);
            } catch (e) {
                // Ignore errors during cleanup
            }
        }
        try {
            await service.removeBucket(service.audioBucket);
        } catch (e) {
            // Ignore errors if bucket is not empty or doesn't exist
        }
    });

    it("should be defined", () => {
        expect(processMedia).toBeDefined();
    });

    it("can process and upload an audio", async () => {
        const audio = new MediaDto();
        audio.fileCollections = [];
        audio.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(audio, undefined, service);
        // Check if files are uploaded
        const files = audio.fileCollections.map((f) => f.fileUrl.split("/").pop()!);
        for (const file of files) {
            const res = await service.getObject(service.audioBucket, file);
            expect(res).toBeDefined();
        }
        resAudios.push(audio);
    });

    it("can delete a removed audio from S3", async () => {
        const audio = new MediaDto();
        audio.fileCollections = [];
        audio.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(audio, undefined, service);
        const originalFiles = audio.fileCollections.map((f) => f.fileUrl.split("/").pop()!);

        // Simulate removing one version
        audio.fileCollections = audio.fileCollections.filter((f) => !f.fileUrl.includes("default"));
        const removedFiles = originalFiles.filter(
            (f) => !audio.fileCollections.some((c) => c.fileUrl.endsWith(f)),
        );

        // Remove from S3
        await service.removeObjects(service.audioBucket, removedFiles);

        // Check if removed files are gone
        for (const file of removedFiles) {
            let error;
            await service.getObject(service.audioBucket, file).catch((e) => (error = e));
            expect(error).toBeDefined();
        }

        // Check if remaining files are still there
        const remainingFiles = audio.fileCollections.map((f) => f.fileUrl.split("/").pop()!);
        for (const file of remainingFiles) {
            const res = await service.getObject(service.audioBucket, file);
            expect(res).toBeDefined();
        }

        resAudios.push(audio);
    });

    it("discards user-added file collection objects", async () => {
        const audio = new MediaDto();
        audio.fileCollections = [];
        audio.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(audio, undefined, service);

        const audio2 = JSON.parse(JSON.stringify(audio)) as MediaDto;
        audio2.fileCollections.push({
            languageId: "invalid",
            fileUrl: "http://example.com/invalid.mp3",
            filename: "invalid",
            bitrate: 128,
            mediaType: MediaType.Audio,
        });

        await processMedia(audio2, audio, service);

        // Check if the client-added file collection is removed
        expect(audio2.fileCollections.length).toBe(1);

        resAudios.push(audio);
    });

    it("should allow uploading audio for different languages independently", async () => {
        // First, upload audio for English
        const audio = new MediaDto();
        audio.fileCollections = [];
        audio.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(audio, undefined, service);
        expect(audio.fileCollections.length).toBe(1);
        expect(audio.fileCollections[0].languageId).toBe("lang-eng");

        const englishFileUrl = audio.fileCollections[0].fileUrl;

        // Now upload audio for Spanish, keeping the English audio
        const audio2 = JSON.parse(JSON.stringify(audio)) as MediaDto;
        audio2.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-spa",
            },
        ];

        await processMedia(audio2, audio, service);

        // Should have both English and Spanish audios
        expect(audio2.fileCollections.length).toBe(2);
        expect(audio2.fileCollections.find((f) => f.languageId === "lang-eng")).toBeDefined();
        expect(audio2.fileCollections.find((f) => f.languageId === "lang-spa")).toBeDefined();
        expect(audio2.fileCollections.find((f) => f.languageId === "lang-eng")?.fileUrl).toBe(
            englishFileUrl,
        );

        // Verify both files exist in S3
        for (const fileCollection of audio2.fileCollections) {
            const filename = fileCollection.fileUrl.split("/").pop()!;
            const res = await service.getObject(service.audioBucket, filename);
            expect(res).toBeDefined();
        }

        resAudios.push(audio2);
    });

    it("should replace audio when uploading for same language", async () => {
        // First, upload audio for English
        const audio = new MediaDto();
        audio.fileCollections = [];
        audio.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(audio, undefined, service);
        expect(audio.fileCollections.length).toBe(1);

        const firstFileUrl = audio.fileCollections[0].fileUrl;

        // Upload a new audio for English (should replace the old one)
        const audio2 = JSON.parse(JSON.stringify(audio)) as MediaDto;
        audio2.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];

        await processMedia(audio2, audio, service);

        // Should still have only one audio file (the new one)
        expect(audio2.fileCollections.length).toBe(1);
        expect(audio2.fileCollections[0].languageId).toBe("lang-eng");
        expect(audio2.fileCollections[0].fileUrl).not.toBe(firstFileUrl);

        resAudios.push(audio2);
    });

    it("should delete audio file from S3 when removed from fileCollections", async () => {
        // First, upload audio for English and Spanish
        const audio = new MediaDto();
        audio.fileCollections = [];
        audio.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-spa",
            },
        ];
        await processMedia(audio, undefined, service);
        expect(audio.fileCollections.length).toBe(2);

        const englishFile = audio.fileCollections.find((f) => f.languageId === "lang-eng");
        const spanishFile = audio.fileCollections.find((f) => f.languageId === "lang-spa");
        expect(englishFile).toBeDefined();
        expect(spanishFile).toBeDefined();

        const englishKey = englishFile!.fileUrl.split("/").pop()!;
        const spanishKey = spanishFile!.fileUrl.split("/").pop()!;

        // Verify both files exist in S3
        const englishExists = await service.getObject(service.audioBucket, englishKey);
        let spanishExists = await service.getObject(service.audioBucket, spanishKey);
        expect(englishExists).toBeDefined();
        expect(spanishExists).toBeDefined();

        // Remove English audio from fileCollections (simulate user deletion)
        const audio2 = JSON.parse(JSON.stringify(audio)) as MediaDto;
        audio2.fileCollections = audio2.fileCollections.filter((f) => f.languageId !== "lang-eng");

        await processMedia(audio2, audio, service);

        // Should only have Spanish audio now
        expect(audio2.fileCollections.length).toBe(1);
        expect(audio2.fileCollections[0].languageId).toBe("lang-spa");

        // Verify English file is deleted from S3
        let englishError;
        await service.getObject(service.audioBucket, englishKey).catch((e) => (englishError = e));
        expect(englishError).toBeDefined();

        // Verify Spanish file still exists in S3
        spanishExists = await service.getObject(service.audioBucket, spanishKey);
        expect(spanishExists).toBeDefined();

        resAudios.push(audio2);
    });
});
