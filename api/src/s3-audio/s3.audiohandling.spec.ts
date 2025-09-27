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
        const removeFiles = resAudios.flatMap((r) => r.fileCollections.map((f) => f.fileUrl));
        await service.removeObjects(service.audioBucket, removeFiles);
        await service.removeBucket(service.audioBucket);
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
            const res = await service.getObject(service.audioBucket, file);
            expect(res).toBeUndefined();
        }

        // Check if remaining files are still there
        const remainingFiles = audio.fileCollections.map((f) => f.fileUrl.split("/").pop()!);
        for (const file of remainingFiles) {
            const res = await service.getObject(service.audioBucket, file);
            expect(res).toBeDefined();
        }

        resAudios.push(audio);
    });
});
