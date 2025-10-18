import { processMedia } from "./media.handling";
import { S3MediaService } from "./media.service";
import { createTestingModule } from "../test/testingModule";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { MediaDto } from "../dto/MediaDto";
import { MediaPreset, MediaType } from "../enums";

describe("S3MediaHandler", () => {
    let service: S3MediaService;
    const resMedias: MediaDto[] = [];

    beforeAll(async () => {
        service = (await createTestingModule("mediahandling")).s3MediaService;
        service.mediaBucket = uuidv4();
        await service.makeBucket(service.mediaBucket);
    });

    afterAll(async () => {
        // Cleanup uploaded medias files
        const removeFiles = Array.from(
            new Set(
                resMedias.flatMap((r) =>
                    r.fileCollections.map((f) => f.fileUrl.split("/").pop()!).filter(Boolean),
                ),
            ),
        );
        if (removeFiles.length > 0) {
            try {
                await service.removeObjects(service.mediaBucket, removeFiles);
            } catch (e) {
                // Ignore errors during cleanup
            }
        }
        try {
            await service.removeBucket(service.mediaBucket);
        } catch (e) {
            // Ignore errors if bucket is not empty or doesn't exist
        }
    });

    it("should be defined", () => {
        expect(processMedia).toBeDefined();
    });

    it("can process and upload an media", async () => {
        const media = new MediaDto();
        media.fileCollections = [];
        media.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(media, undefined, service);

        // Check if files are uploaded
        const files = media.fileCollections.map((f) => f.fileUrl.split("/").pop()!);
        for (const file of files) {
            const res = await service.getObject(service.mediaBucket, file);
            expect(res).toBeDefined();
        }
        resMedias.push(media);
    });

    it("can delete a removed media from S3", async () => {
        const media = new MediaDto();
        media.fileCollections = [];
        media.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(media, undefined, service);
        const originalFiles = media.fileCollections.map((f) => f.fileUrl.split("/").pop()!);

        // Simulate removing one version
        media.fileCollections = media.fileCollections.filter((f) => !f.fileUrl.includes("default"));
        const removedFiles = originalFiles.filter(
            (f) => !media.fileCollections.some((c) => c.fileUrl.endsWith(f)),
        );

        // Remove from S3
        await service.removeObjects(service.mediaBucket, removedFiles);

        // Check if removed files are gone
        for (const file of removedFiles) {
            let error;
            await service.getObject(service.mediaBucket, file).catch((e) => (error = e));
            expect(error).toBeDefined();
        }

        // Check if remaining files are still there
        const remainingFiles = media.fileCollections.map((f) => f.fileUrl.split("/").pop()!);
        for (const file of remainingFiles) {
            const res = await service.getObject(service.mediaBucket, file);
            expect(res).toBeDefined();
        }

        resMedias.push(media);
    });

    it("discards user-added file collection objects", async () => {
        const media = new MediaDto();
        media.fileCollections = [];
        media.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(media, undefined, service);

        const media2 = JSON.parse(JSON.stringify(media)) as MediaDto;
        media2.fileCollections.push({
            languageId: "invalid",
            fileUrl: "http://example.com/invalid.mp3",
            bitrate: 128,
            mediaType: MediaType.Audio,
        });

        await processMedia(media2, media, service);

        // Check if the client-added file collection is removed
        expect(media2.fileCollections.length).toBe(1);

        resMedias.push(media2);
    });

    it("should allow uploading mediafor different languages independently", async () => {
        // First, upload mediafor English
        const media = new MediaDto();
        media.fileCollections = [];
        media.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(media, undefined, service);
        expect(media.fileCollections.length).toBe(1);
        expect(media.fileCollections[0].languageId).toBe("lang-eng");

        const englishFileUrl = media.fileCollections[0].fileUrl;

        // Now upload mediafor Spanish, keeping the English audio
        const media2 = JSON.parse(JSON.stringify(media)) as MediaDto;
        media2.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-spa",
            },
        ];

        await processMedia(media2, media, service);

        // Should have both English and Spanish medias
        expect(media2.fileCollections.length).toBe(2);
        expect(media2.fileCollections.find((f) => f.languageId === "lang-eng")).toBeDefined();
        expect(media2.fileCollections.find((f) => f.languageId === "lang-spa")).toBeDefined();
        expect(media2.fileCollections.find((f) => f.languageId === "lang-eng")?.fileUrl).toBe(
            englishFileUrl,
        );

        // Verify both files exist in S3
        for (const fileCollection of media2.fileCollections) {
            const filename = fileCollection.fileUrl.split("/").pop()!;
            const res = await service.getObject(service.mediaBucket, filename);
            expect(res).toBeDefined();
        }

        resMedias.push(media2);
    });

    it("should replace media when uploading for same language", async () => {
        // First, upload mediafor English
        const media = new MediaDto();
        media.fileCollections = [];
        media.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(media, undefined, service);
        expect(media.fileCollections.length).toBe(1);

        const firstFileUrl = media.fileCollections[0].fileUrl;

        // Upload a new mediafor English (should replace the old one)
        const media2 = JSON.parse(JSON.stringify(media)) as MediaDto;
        media2.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];

        await processMedia(media2, media, service);

        // Should still have only one mediafile (the new one)
        expect(media2.fileCollections.length).toBe(1);
        expect(media2.fileCollections[0].languageId).toBe("lang-eng");
        expect(media2.fileCollections[0].fileUrl).not.toBe(firstFileUrl);

        resMedias.push(media2);
    });

    it("should delete mediafile from S3 when removed from fileCollections", async () => {
        // First, upload mediafor English and Spanish
        const media = new MediaDto();
        media.fileCollections = [];
        media.uploadData = [
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
        await processMedia(media, undefined, service);
        expect(media.fileCollections.length).toBe(2);

        const englishFile = media.fileCollections.find((f) => f.languageId === "lang-eng");
        const spanishFile = media.fileCollections.find((f) => f.languageId === "lang-spa");
        expect(englishFile).toBeDefined();
        expect(spanishFile).toBeDefined();

        const englishKey = englishFile!.fileUrl.split("/").pop()!;
        const spanishKey = spanishFile!.fileUrl.split("/").pop()!;

        // Verify both files exist in S3
        const englishExists = await service.getObject(service.mediaBucket, englishKey);
        let spanishExists = await service.getObject(service.mediaBucket, spanishKey);

        expect(englishExists).toBeDefined();
        expect(spanishExists).toBeDefined();

        // Remove English mediafrom fileCollections (simulate user deletion)
        const media2 = JSON.parse(JSON.stringify(media)) as MediaDto;
        media2.fileCollections = media2.fileCollections.filter((f) => f.languageId !== "lang-eng");

        await processMedia(media2, media, service);

        // Should only have Spanish media now
        expect(media2.fileCollections.length).toBe(1);
        expect(media2.fileCollections[0].languageId).toBe("lang-spa");

        // Verify English file is deleted from S3
        let englishError;
        await service.getObject(service.mediaBucket, englishKey).catch((e) => (englishError = e));
        expect(englishError).toBeDefined();

        // Verify Spanish file still exists in S3
        spanishExists = await service.getObject(service.mediaBucket, spanishKey);
        expect(spanishExists).toBeDefined();

        resMedias.push(media2);
    });
});
