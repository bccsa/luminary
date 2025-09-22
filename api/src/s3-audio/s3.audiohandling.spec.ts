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
                    path.resolve(__dirname, "../test/silence.wav"),
                ) as unknown as ArrayBuffer,
                preset: MediaPreset.Default,
                mediaType: MediaType.Audio,
            },
        ];

        const warnings = await processMedia(audio, service);
        expect(warnings.length).toBe(0);
        expect(audio.fileCollections.length).toBe(1);

        // Check that the uploaded file exists in S3
        const s3Object = await service.getObject(
            service.audioBucket,
            audio.fileCollections[0].fileUrl,
        );
        expect(s3Object).toBeDefined();

        resAudios.push(audio);
    });
});
