import { ImageDto } from "../dto/ImageDto";
import { processImage } from "./s3.imagehandling";
import { S3Service } from "./s3.service";
import { createTestingModule } from "../test/testingModule";
import * as fs from "fs";
import { v4 as uuidv4 } from "uuid";
import * as path from "path";

describe("S3ImageHandler", () => {
    let service: S3Service;
    const resImages: ImageDto[] = [];

    beforeAll(async () => {
        service = (await createTestingModule("imagehandling")).s3Service;
        service.imageBucket = uuidv4();
        await service.makeBucket(service.imageBucket);
    });

    afterAll(async () => {
        const removeFiles = resImages.flatMap((r) => r.files.map((f) => f.filename));
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
        const resImage = await processImage(image, undefined, service);
        expect(resImage).toBeDefined();

        // Check if all files are uploaded
        const pList = [];
        for (const file of resImage.files) {
            expect(file.filename).toBeDefined();
            pList.push(service.getObject(service.imageBucket, file.filename));
        }
        const res = await Promise.all(pList);
        expect(res.some((r) => r == undefined)).toBeFalsy();

        resImages.push(resImage);
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
        let resImage = await processImage(image, undefined, service);

        // Remove the first file
        const prevDoc = new ImageDto();
        prevDoc.files.push(...resImage.files);
        image.files.shift();
        resImage = await processImage(image, prevDoc, service);

        // Check if the first file is removed
        let error;
        await service
            .getObject(service.imageBucket, prevDoc.files[0].filename)
            .catch((e) => (error = e));
        expect(error).toBeDefined();

        resImages.push(resImage);
    });

    it("Discards user-added file objects", async () => {
        const image = new ImageDto();
        image.name = "testImage3";
        image.uploadData = [
            {
                fileData: fs.readFileSync(path.resolve(__dirname + "/../test/" + "testImage.jpg")),
                preset: "default",
            },
        ];
        const res = await processImage(image, undefined, service);

        const image2 = JSON.parse(JSON.stringify(res)) as ImageDto;
        image2.files.push({ filename: "invalid", aspectRatio: 1, height: 1, width: 1 });

        const resImage = await processImage(image2, res, service);

        // Check if the client-added file data is removed
        expect(resImage.files.some((f) => f.filename == "invalid")).toBeFalsy();

        resImages.push(resImage);
    });
});
