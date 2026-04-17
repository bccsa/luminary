import { ImageDto } from "../../dto/ImageDto";
import { DbService } from "../../db/db.service";

const mockRemoveObject = jest.fn();
const mockGetBucketName = jest.fn(() => "test-bucket");

jest.mock("../../s3/s3.service", () => ({
    S3Service: {
        create: jest.fn().mockImplementation(async () => ({
            getClient: () => ({
                removeObject: mockRemoveObject,
            }),
            getBucketName: mockGetBucketName,
        })),
        clearCache: jest.fn(),
    },
}));

import { deleteImage } from "./processImageDto";
import { S3Service } from "../../s3/s3.service";

describe("deleteImage", () => {
    beforeEach(() => {
        mockRemoveObject.mockReset();
        mockRemoveObject.mockResolvedValue(undefined);
        mockGetBucketName.mockReturnValue("test-bucket");
        (S3Service.create as jest.Mock).mockClear();
    });

    it("returns no warnings when there are no files", async () => {
        const db = { getDoc: jest.fn() } as unknown as DbService;
        const image = new ImageDto();

        const warnings = await deleteImage(image, "bucket-id", db);

        expect(warnings).toEqual([]);
        expect(db.getDoc).not.toHaveBeenCalled();
        expect(S3Service.create).not.toHaveBeenCalled();
    });

    it("warns when bucket id is missing but files exist", async () => {
        const db = { getDoc: jest.fn() } as unknown as DbService;
        const image = new ImageDto();
        image.fileCollections = [
            {
                aspectRatio: 1,
                imageFiles: [{ filename: "orphan.webp", width: 1, height: 1 }],
            },
        ];

        const warnings = await deleteImage(image, undefined, db);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("cannot be automatically deleted");
        expect(db.getDoc).not.toHaveBeenCalled();
    });

    it("removes each file from S3 when bucket resolves", async () => {
        const db = {
            getDoc: jest.fn().mockResolvedValue({ docs: [{ _id: "bucket-id" }] }),
        } as unknown as DbService;
        const image = new ImageDto();
        image.fileCollections = [
            {
                aspectRatio: 1,
                imageFiles: [
                    { filename: "a.webp", width: 1, height: 1 },
                    { filename: "b.webp", width: 1, height: 1 },
                ],
            },
        ];

        const warnings = await deleteImage(image, "bucket-id", db);

        expect(warnings).toEqual([]);
        expect(S3Service.create).toHaveBeenCalledWith("bucket-id", db);
        expect(mockRemoveObject).toHaveBeenCalledTimes(2);
        expect(mockRemoveObject).toHaveBeenCalledWith("test-bucket", "a.webp");
        expect(mockRemoveObject).toHaveBeenCalledWith("test-bucket", "b.webp");
    });

    it("collects warnings when removeObject fails", async () => {
        const db = {
            getDoc: jest.fn().mockResolvedValue({ docs: [{ _id: "bucket-id" }] }),
        } as unknown as DbService;
        const image = new ImageDto();
        image.fileCollections = [
            {
                aspectRatio: 1,
                imageFiles: [{ filename: "bad.webp", width: 1, height: 1 }],
            },
        ];
        mockRemoveObject.mockRejectedValueOnce(new Error("S3 error"));

        const warnings = await deleteImage(image, "bucket-id", db);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("Failed to delete bad.webp");
    });

    it("warns when bucket document is missing", async () => {
        const db = {
            getDoc: jest.fn().mockResolvedValue({ docs: [] }),
        } as unknown as DbService;
        const image = new ImageDto();
        image.fileCollections = [
            {
                aspectRatio: 1,
                imageFiles: [{ filename: "x.webp", width: 1, height: 1 }],
            },
        ];

        const warnings = await deleteImage(image, "missing-bucket", db);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("Bucket missing-bucket not found");
        expect(mockRemoveObject).not.toHaveBeenCalled();
    });
});
