import { ImageDto } from "../dto/ImageDto";
import { processImage } from "./s3.imagehandling";
import { S3Service } from "./s3.service";
import { createTestingModule } from "../test/testingModule";
import * as fs from "fs";
import { v4 as uuidv4 } from "uuid";
import * as path from "path";

describe("S3ImageHandler", () => {
    let service: S3Service;
    let resImage: ImageDto;
    let resImage2: ImageDto;

    beforeAll(async () => {
        service = (await createTestingModule("imagehandling")).s3Service;
        service.imageBucket = uuidv4();
        await service.makeBucket(service.imageBucket);
    });

    afterAll(async () => {
        // Remove files and bucket
        const removeFiles = resImage.files
            .map((f) => f.filename)
            .concat(resImage2.files.map((f) => f.filename));
        await service.removeObjects(service.imageBucket, removeFiles);
        await service.removeBucket(service.imageBucket);
    });

    it("should be defined", () => {
        expect(processImage).toBeDefined();
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
        resImage = await processImage(image, undefined, service);

        expect(resImage).toBeDefined();

        // Check if all files are uploaded
        const pList = [];
        for (const file of resImage.files) {
            expect(file.filename).toBeDefined();
            pList.push(service.getObject(service.imageBucket, file.filename));
        }
        const res = await Promise.all(pList);
        expect(res.some((r) => r == undefined)).toBeFalsy();
    });

    it("can delete a removed image version from S3", async () => {
        const image = new ImageDto();
        image.name = "testImage";
        image.uploadData = [
            {
                fileData: fs.readFileSync(path.resolve(__dirname + "/../test/" + "testImage.jpg")),
                preset: "default",
            },
        ];
        resImage2 = await processImage(image, undefined, service);

        // Remove the first file
        const prevDoc = new ImageDto();
        prevDoc.files.push(...resImage2.files);
        prevDoc.files.shift();
        resImage2 = await processImage(image, prevDoc, service);

        // Check if the first file is removed
        let error;
        await service
            .getObject(service.imageBucket, prevDoc.files[0].filename)
            .catch((e) => (error = e));
        expect(error).toBeUndefined();
    });
});
