import { processImage } from "./processImageDto";
import { S3Service } from "../../s3/s3.service";
import { DbService } from "../../db/db.service";
import { ImageDto } from "../../dto/ImageDto";

jest.mock("../../s3/s3.service", () => ({ S3Service: { create: jest.fn() } }));

const FILES = ["a.webp", "b.webp", "c.webp"];

const image = (): ImageDto =>
    ({
        fileCollections: [
            {
                aspectRatio: 1,
                imageFiles: FILES.map((filename) => ({ filename, width: 100, height: 100 })),
            },
        ],
    }) as unknown as ImageDto;

const stubS3 = (opts: { putRejects?: string; destinationSize?: number } = {}) => {
    const source = {
        getBucketName: () => "old",
        statObject: jest.fn(async () => ({ size: 10, metaData: { "content-type": "image/png" } })),
        getObject: jest.fn(async (k: string) => `stream:${k}`),
        removeObjects: jest.fn().mockResolvedValue(undefined),
    };
    const destination = {
        getBucketName: () => "new",
        putStream: jest.fn(async (k: string) => {
            if (opts.putRejects === k) throw new Error("connection reset");
        }),
        statObject: jest.fn(async () => ({ size: opts.destinationSize ?? 10 })),
    };
    (S3Service.create as jest.Mock).mockImplementation(async (id: string) =>
        id === "bucket-old" ? source : destination,
    );
    return { source, destination };
};

const migrate = (img: ImageDto) =>
    processImage(img, image(), {} as DbService, "bucket-new", "bucket-old");

describe("processImage bucket migration", () => {
    beforeEach(() => jest.clearAllMocks());

    it("copies every file, and removes the originals only when asked after the write", async () => {
        const { source, destination } = stubS3();

        const result = await migrate(image());

        expect(result.migrationFailed).toBe(false);
        expect(destination.putStream.mock.calls.map((c) => c[0])).toEqual(FILES);
        expect(source.removeObjects).not.toHaveBeenCalled();

        expect(await result.removeSource!()).toEqual([]);
        expect(source.removeObjects).toHaveBeenCalledWith(FILES);
    });

    it("keeps the source's content type", async () => {
        const { destination } = stubS3();

        await migrate(image());

        expect(destination.putStream).toHaveBeenCalledWith(
            "a.webp",
            "stream:a.webp",
            10,
            "image/png",
        );
    });

    it("deletes nothing when a copy fails partway", async () => {
        const { source } = stubS3({ putRejects: "b.webp" });

        const result = await migrate(image());

        expect(result.migrationFailed).toBe(true);
        expect(result.removeSource).toBeUndefined();
        expect(source.removeObjects).not.toHaveBeenCalled();
    });

    it("treats a truncated copy as a failure", async () => {
        const { source } = stubS3({ destinationSize: 3 });

        const result = await migrate(image());

        expect(result.migrationFailed).toBe(true);
        expect(result.warnings.join(" ")).toContain("copied as 3 bytes");
        expect(source.removeObjects).not.toHaveBeenCalled();
    });

    it("reports originals it could not remove without failing the move", async () => {
        const { source } = stubS3();
        source.removeObjects.mockRejectedValue(new Error("read-only"));

        const result = await migrate(image());

        expect(result.migrationFailed).toBe(false);
        expect((await result.removeSource!()).join(" ")).toContain("could not be removed");
    });
});
