import { ImageDto } from "../dto/ImageDto";
import { processImageUpload } from "./s3.imagehandling";
import { S3Service } from "./s3.service";
import { createS3TestingModule } from "../test/testingModule";
import * as fs from "fs";
import { v4 as uuidv4 } from "uuid";
import * as path from "path";

describe("S3ImageHandler", () => {
    let service: S3Service;
    let resImage: ImageDto;

    beforeAll(async () => {
        service = (await createS3TestingModule()).s3Service;
        service.imageBucket = uuidv4();
        await service.makeBucket(service.imageBucket);
    });

    afterAll(async () => {
        // Remove files and bucket
        await service.removeObjects(
            service.imageBucket,
            resImage.files.map((f) => f.fileName),
        );
        await service.removeBucket(service.imageBucket);
    });

    it("should be defined", () => {
        expect(processImageUpload).toBeDefined();
    });

    it("can process and upload an image", async () => {
        const image = new ImageDto();
        image.name = "testImage";
        image.uploadData = [
            {
                fileData: fs.readFileSync(path.resolve(__dirname + "/../test/" + "testImage.jpg")),
                preset: "default",
            },
        ];
        resImage = await processImageUpload(image, service);

        expect(resImage).toBeDefined();

        // Check if all files are uploaded
        for (const file of resImage.files) {
            expect(file.fileName).toBeDefined();

            await service.getObject(service.imageBucket, file.fileName).then((f) => {
                expect(f).toBeDefined();
            });
        }
    });
});
