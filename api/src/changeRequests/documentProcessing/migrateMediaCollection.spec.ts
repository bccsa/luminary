import { migrateMediaCollection } from "./migrateMediaCollection";
import { S3Service } from "../../s3/s3.service";
import { DbService } from "../../db/db.service";
import { MediaDto } from "../../dto/MediaDto";

jest.mock("../../s3/s3.service", () => ({ S3Service: { create: jest.fn() } }));

const SESSION = "c5829f07-4ba8-42ed-a449-80d83e6c0b53";
const OLD_BASE = "http://old.example.com/media";
const NEW_BASE = "http://new.example.com/media";
const OLD_URL = `${OLD_BASE}/${SESSION}/master.m3u8`;

const KEYS = [
    `${SESSION}/master.m3u8`,
    `${SESSION}/stream_1080p/playlist.m3u8`,
    `${SESSION}/media/v0_0.m4s`,
];

/** Buckets keyed by id, as `db.getDoc` would return them. */
const stubDb = (buckets: Record<string, { publicUrl?: string; name?: string }>) =>
    ({
        getDoc: jest.fn(async (id: string) =>
            buckets[id] ? { docs: [buckets[id]] } : { docs: [] },
        ),
    }) as unknown as DbService;

const defaultDb = () =>
    stubDb({
        "bucket-old": { publicUrl: OLD_BASE, name: "old-bucket" },
        "bucket-new": { publicUrl: NEW_BASE, name: "new-bucket" },
    });

/**
 * A pair of fake buckets. Sizes are recorded per key so a truncated copy can be
 * simulated by returning a different size from the destination.
 */
const stubS3 = (
    opts: {
        keys?: string[];
        sizes?: Record<string, number>;
        destinationSizes?: Record<string, number>;
        putRejects?: string;
        removeRejects?: boolean;
    } = {},
) => {
    const keys = opts.keys ?? KEYS;
    const sizes = opts.sizes ?? Object.fromEntries(keys.map((k) => [k, 100]));

    const source = {
        listObjectsUnder: jest.fn().mockResolvedValue(keys),
        statObject: jest.fn(async (k: string) => ({
            size: sizes[k],
            metaData: { "content-type": "video/iso.segment" },
        })),
        getObject: jest.fn(async (k: string) => `stream:${k}`),
        removeObjects: opts.removeRejects
            ? jest.fn().mockRejectedValue(new Error("bucket is read-only"))
            : jest.fn().mockResolvedValue(undefined),
    };

    const destination = {
        putStream: jest.fn(async (k: string) => {
            if (opts.putRejects === k) throw new Error("connection reset");
        }),
        statObject: jest.fn(async (k: string) => ({
            size: (opts.destinationSizes ?? sizes)[k],
        })),
    };

    (S3Service.create as jest.Mock).mockImplementation(async (bucketId: string) =>
        bucketId === "bucket-old" ? source : destination,
    );

    return { source, destination };
};

const media = (): MediaDto => ({ hlsUrl: OLD_URL }) as MediaDto;

const migrate = (m: MediaDto, db: DbService) =>
    migrateMediaCollection(m, OLD_URL, "bucket-old", "bucket-new", db);

describe("migrateMediaCollection", () => {
    beforeEach(() => jest.clearAllMocks());

    it("copies every object, then repoints the document at the new bucket", async () => {
        const { source, destination } = stubS3();
        const m = media();

        const result = await migrate(m, defaultDb());

        expect(result.failed).toBe(false);
        expect(destination.putStream).toHaveBeenCalledTimes(KEYS.length);
        expect(m.hlsUrl).toBe(`${NEW_BASE}/${SESSION}/master.m3u8`);
        expect(source.removeObjects).toHaveBeenCalledWith(KEYS);
    });

    it("preserves each object's key, so the playlists' relative paths still resolve", async () => {
        // Media playlists reference segments as `../media/<chain>_<n>.m4s`. Renaming
        // anything on the way across would break playback silently.
        const { destination } = stubS3();

        await migrate(media(), defaultDb());

        expect(destination.putStream.mock.calls.map((c) => c[0])).toEqual(KEYS);
    });

    it("streams rather than buffering, and passes the source's size and type", async () => {
        const { destination } = stubS3({ sizes: Object.fromEntries(KEYS.map((k) => [k, 512])) });

        await migrate(media(), defaultDb());

        expect(destination.putStream).toHaveBeenCalledWith(
            KEYS[0],
            `stream:${KEYS[0]}`,
            512,
            "video/iso.segment",
        );
    });

    it("does not delete the source or move the URL when a copy fails", async () => {
        // The guarantee that matters: a failed migration leaves a whole, reachable
        // collection where the document already says it is.
        const { source } = stubS3({ putRejects: KEYS[1] });
        const m = media();

        const result = await migrate(m, defaultDb());

        expect(result.failed).toBe(true);
        expect(source.removeObjects).not.toHaveBeenCalled();
        expect(m.hlsUrl).toBe(OLD_URL);
    });

    it("treats a truncated copy as a failure", async () => {
        const { source } = stubS3({
            sizes: { [KEYS[0]]: 100, [KEYS[1]]: 100, [KEYS[2]]: 100 },
            destinationSizes: { [KEYS[0]]: 100, [KEYS[1]]: 40, [KEYS[2]]: 100 },
        });
        const m = media();

        const result = await migrate(m, defaultDb());

        expect(result.failed).toBe(true);
        expect(result.warnings.join(" ")).toContain(KEYS[1]);
        expect(source.removeObjects).not.toHaveBeenCalled();
        expect(m.hlsUrl).toBe(OLD_URL);
    });

    it("succeeds when the copy worked but the originals could not be removed", async () => {
        // Leftovers cost storage; they do not break playback, and the document
        // already points at the new bucket.
        stubS3({ removeRejects: true });
        const m = media();

        const result = await migrate(m, defaultDb());

        expect(result.failed).toBe(false);
        expect(m.hlsUrl).toBe(`${NEW_BASE}/${SESSION}/master.m3u8`);
        expect(result.warnings.join(" ")).toContain("could not be removed");
    });

    it("refuses a URL it cannot prove the encoder wrote", async () => {
        stubS3();
        const m = { hlsUrl: `${OLD_BASE}/shared-folder/master.m3u8` } as MediaDto;

        const result = await migrateMediaCollection(
            m,
            `${OLD_BASE}/shared-folder/master.m3u8`,
            "bucket-old",
            "bucket-new",
            defaultDb(),
        );

        expect(result.failed).toBe(true);
        expect(result.warnings.join(" ")).toContain("not a session id");
    });

    it("refuses when the destination has no public URL to publish under", async () => {
        stubS3();
        const db = stubDb({
            "bucket-old": { publicUrl: OLD_BASE, name: "old" },
            "bucket-new": { name: "new" },
        });

        const result = await migrate(media(), db);

        expect(result.failed).toBe(true);
        expect(result.warnings.join(" ")).toContain("no public URL");
        expect(S3Service.create).not.toHaveBeenCalled();
    });

    it("fails when a bucket document has gone", async () => {
        stubS3();
        const db = stubDb({ "bucket-old": { publicUrl: OLD_BASE } });

        const result = await migrate(media(), db);

        expect(result.failed).toBe(true);
        expect(result.warnings.join(" ")).toContain("no longer exists");
    });

    it("reports an empty source rather than repointing at nothing", async () => {
        stubS3({ keys: [] });
        const m = media();

        const result = await migrate(m, defaultDb());

        expect(result.failed).toBe(true);
        expect(m.hlsUrl).toBe(OLD_URL);
    });

    it("leaves a hand-edited URL alone instead of moving files under it", async () => {
        // Changing the URL and the bucket together is repointing the document, not
        // asking for a migration.
        stubS3();
        const m = { hlsUrl: "http://elsewhere/x/master.m3u8" } as MediaDto;

        const result = await migrateMediaCollection(
            m,
            OLD_URL,
            "bucket-old",
            "bucket-new",
            defaultDb(),
        );

        expect(result.failed).toBe(false);
        expect(m.hlsUrl).toBe("http://elsewhere/x/master.m3u8");
        expect(S3Service.create).not.toHaveBeenCalled();
    });

    it("does nothing for a document that never had media", async () => {
        stubS3();

        const result = await migrateMediaCollection(
            {} as unknown as MediaDto,
            undefined,
            "bucket-old",
            "bucket-new",
            defaultDb(),
        );

        expect(result.failed).toBe(false);
        expect(S3Service.create).not.toHaveBeenCalled();
    });
});
