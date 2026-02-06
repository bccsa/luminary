import { processMedia } from "./processMediaDto";
import { S3Service } from "../../s3/s3.service";
import { createTestingModule } from "../../test/testingModule";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { MediaDto } from "../../dto/MediaDto";
import { MediaPreset, MediaType, DocType, StorageType } from "../../enums";
import { DbService } from "../../db/db.service";
import { storeCryptoData } from "../../util/encryption";

describe("processMediaDto", () => {
    let db: DbService;
    let s3Service: S3Service;
    let testBucketId: string;
    let testBucket: string;
    const resMedia: MediaDto[] = [];

    const testCredentials = {
        endpoint: "http://127.0.0.1:9000",
        bucketName: "", // Will be set in beforeAll
        accessKey: "minio",
        secretKey: "minio123",
    };

    beforeAll(async () => {
        const module = await createTestingModule("process-media-dto");
        db = module.dbService;

        testBucket = `test-media-${uuidv4()}`;
        testBucketId = `storage-test-${uuidv4()}`;
        testCredentials.bucketName = testBucket;

        // Create encrypted credentials for the test bucket
        const encryptedCredId = await storeCryptoData(db, testCredentials);

        // Create a bucket document
        const bucketDoc = {
            _id: testBucketId,
            type: DocType.Storage,
            name: "Test Media Bucket",
            mimeTypes: ["audio/*"],
            publicUrl: `http://127.0.0.1:9000/${testBucket}`,
            storageType: StorageType.Media,
            credential_id: encryptedCredId,
            memberOf: ["group-super-admins"],
            updatedTimeUtc: Date.now(),
        };

        await db.upsertDoc(bucketDoc);

        // Create S3Service instance and create the bucket
        s3Service = await S3Service.create(testBucketId, db);
        await s3Service.makeBucket();
    });

    afterAll(async () => {
        // Cleanup uploaded media files
        const removeFiles = Array.from(
            new Set(
                resMedia.flatMap((r) =>
                    r.fileCollections.map((f) => f.fileUrl.split("/").pop()!).filter(Boolean),
                ),
            ),
        );
        if (removeFiles.length > 0) {
            try {
                await s3Service.removeObjects(removeFiles);
            } catch (e) {
                // Ignore errors during cleanup
            }
        }
        try {
            await s3Service.removeBucket();
        } catch (e) {
            // Ignore errors if bucket is not empty or doesn't exist
        }

        // Clean up storage document
        if (testBucketId) {
            const storageDoc = (await db.getDoc(testBucketId)).docs[0];
            if (storageDoc) {
                storageDoc.deleteReq = 1;
                await db.upsertDoc(storageDoc);
            }
        }

        S3Service.clearCache();
    });

    it("should be defined", () => {
        expect(processMedia).toBeDefined();
    });

    it("can process and upload a media file", async () => {
        const media = new MediaDto();
        media.fileCollections = [];
        media.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        const warnings = await processMedia(media, undefined, db, testBucketId);
        expect(warnings.warnings.length).toBe(0);

        // Check if files are uploaded (allow informational warnings like S3_PUBLIC_ACCESS_URL not configured)
        const files = media.fileCollections.map((f) => f.fileUrl.split("/").pop()!);
        expect(files.length).toBeGreaterThan(0);

        for (const file of files) {
            const exists = await s3Service.objectExists(file);
            expect(exists).toBe(true);
        }
        resMedia.push(media);
    });

    it("can delete a removed media from S3", async () => {
        const media = new MediaDto();
        media.fileCollections = [];
        media.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(media, undefined, db, testBucketId);
        const originalFiles = media.fileCollections.map((f) => f.fileUrl.split("/").pop()!);

        // Simulate removing the media
        const prevMedia = JSON.parse(JSON.stringify(media)) as MediaDto;
        media.fileCollections = [];

        // Process with previous media
        await processMedia(media, prevMedia, db, testBucketId);

        // Check if removed files are gone
        for (const file of originalFiles) {
            const exists = await s3Service.objectExists(file);
            expect(exists).toBe(false);
        }
    });

    it("discards user-added file collection objects", async () => {
        const media = new MediaDto();
        media.fileCollections = [];
        media.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(media, undefined, db, testBucketId);

        const media2 = JSON.parse(JSON.stringify(media)) as MediaDto;
        media2.fileCollections.push({
            languageId: "invalid",
            fileUrl: "http://example.com/invalid.mp3",
            bitrate: 128,
            mediaType: MediaType.Audio,
        });

        await processMedia(media2, media, db, testBucketId);

        // Check if the client-added file collection is removed
        expect(media2.fileCollections.length).toBe(1);

        resMedia.push(media);
    });

    it("should allow uploading media for different languages independently", async () => {
        // First, upload media for English
        const media = new MediaDto();
        media.fileCollections = [];
        media.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(media, undefined, db, testBucketId);
        expect(media.fileCollections.length).toBe(1);
        expect(media.fileCollections[0].languageId).toBe("lang-eng");

        const englishFileUrl = media.fileCollections[0].fileUrl;

        // Now upload media for Spanish, keeping the English media
        const media2 = JSON.parse(JSON.stringify(media)) as MediaDto;
        media2.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-spa",
            },
        ];

        await processMedia(media2, media, db, testBucketId);

        // Should have both English and Spanish media
        expect(media2.fileCollections.length).toBe(2);
        expect(media2.fileCollections.find((f) => f.languageId === "lang-eng")).toBeDefined();
        expect(media2.fileCollections.find((f) => f.languageId === "lang-spa")).toBeDefined();
        expect(media2.fileCollections.find((f) => f.languageId === "lang-eng")?.fileUrl).toBe(
            englishFileUrl,
        );

        // Verify both files exist in S3
        for (const fileCollection of media2.fileCollections) {
            const filename = fileCollection.fileUrl.split("/").pop()!;
            const exists = await s3Service.objectExists(filename);
            expect(exists).toBe(true);
        }

        resMedia.push(media2);
    });

    it("should replace media when uploading for same language", async () => {
        // First, upload media for English
        const media = new MediaDto();
        media.fileCollections = [];
        media.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];
        await processMedia(media, undefined, db, testBucketId);
        expect(media.fileCollections.length).toBe(1);

        const firstFileUrl = media.fileCollections[0].fileUrl;

        // Upload a new media for English (should replace the old one)
        const media2 = JSON.parse(JSON.stringify(media)) as MediaDto;
        media2.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
        ];

        await processMedia(media2, media, db, testBucketId);

        // Should still have only one media file (the new one)
        expect(media2.fileCollections.length).toBe(1);
        expect(media2.fileCollections[0].languageId).toBe("lang-eng");
        expect(media2.fileCollections[0].fileUrl).not.toBe(firstFileUrl);

        resMedia.push(media2);
    });

    it("should delete media file from S3 when removed from fileCollections", async () => {
        // First, upload media for English and Spanish
        const media = new MediaDto();
        media.fileCollections = [];
        media.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-eng",
            },
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
                languageId: "lang-spa",
            },
        ];
        await processMedia(media, undefined, db, testBucketId);
        expect(media.fileCollections.length).toBe(2);

        const englishFile = media.fileCollections.find((f) => f.languageId === "lang-eng");
        const spanishFile = media.fileCollections.find((f) => f.languageId === "lang-spa");
        expect(englishFile).toBeDefined();
        expect(spanishFile).toBeDefined();

        const englishKey = englishFile!.fileUrl.split("/").pop()!;
        const spanishKey = spanishFile!.fileUrl.split("/").pop()!;

        // Verify both files exist in S3
        expect(await s3Service.objectExists(englishKey)).toBe(true);
        expect(await s3Service.objectExists(spanishKey)).toBe(true);

        // Remove English media from fileCollections (simulate user deletion)
        const media2 = JSON.parse(JSON.stringify(media)) as MediaDto;
        media2.fileCollections = media2.fileCollections.filter((f) => f.languageId !== "lang-eng");

        await processMedia(media2, media, db, testBucketId);

        // Should only have Spanish media now
        expect(media2.fileCollections.length).toBe(1);
        expect(media2.fileCollections[0].languageId).toBe("lang-spa");

        // Verify English file is deleted from S3
        expect(await s3Service.objectExists(englishKey)).toBe(false);

        // Verify Spanish file still exists in S3
        expect(await s3Service.objectExists(spanishKey)).toBe(true);

        resMedia.push(media2);
    });
});
