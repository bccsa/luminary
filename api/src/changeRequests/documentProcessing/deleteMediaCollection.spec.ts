import { deleteMediaCollection, resolveCollectionPrefix } from "./deleteMediaCollection";
import { S3Service } from "../../s3/s3.service";
import { DbService } from "../../db/db.service";
import { MediaDto } from "../../dto/MediaDto";

jest.mock("../../s3/s3.service", () => ({ S3Service: { create: jest.fn() } }));

/** A real collection URL: MinIO, where the bucket name is part of the public path. */
const PUBLIC = "http://localhost:9000/media";
const SESSION = "c5829f07-4ba8-42ed-a449-80d83e6c0b53";
const HLS = `${PUBLIC}/${SESSION}/master.m3u8`;

const prefixOf = (r: ReturnType<typeof resolveCollectionPrefix>) =>
    "prefix" in r ? r.prefix : undefined;
const refusalOf = (r: ReturnType<typeof resolveCollectionPrefix>) =>
    "refusal" in r ? r.refusal : undefined;

describe("resolveCollectionPrefix", () => {
    describe("a URL stored relative to the bucket", () => {
        it("needs no public URL at all — the path is already the key", () => {
            const r = resolveCollectionPrefix(
                "/c5829f07-4ba8-42ed-a449-80d83e6c0b53/master.m3u8",
                undefined,
            );
            expect("prefix" in r && r.prefix).toBe(
                "c5829f07-4ba8-42ed-a449-80d83e6c0b53",
            );
        });

        it("still refuses a folder the encoder did not write", () => {
            const r = resolveCollectionPrefix("/shared-folder/master.m3u8", undefined);
            expect("refusal" in r && r.refusal).toContain("not a session id");
        });

        it("still refuses the bucket root", () => {
            const r = resolveCollectionPrefix("/master.m3u8", undefined);
            expect("refusal" in r && r.refusal).toContain("bucket root");
        });
    });

    describe("resolves a collection this API wrote", () => {
        it("strips the bucket's public base and the master filename", () => {
            expect(prefixOf(resolveCollectionPrefix(HLS, PUBLIC))).toBe(SESSION);
        });

        it("tolerates a trailing slash on the configured public URL", () => {
            expect(prefixOf(resolveCollectionPrefix(HLS, `${PUBLIC}/`))).toBe(SESSION);
            expect(prefixOf(resolveCollectionPrefix(HLS, `${PUBLIC}///`))).toBe(SESSION);
        });

        it("keeps a nested path prefix intact", () => {
            // pathPrefix on the session puts the collection in a subfolder.
            const url = `${PUBLIC}/tenant-a/videos/${SESSION}/master.m3u8`;
            expect(prefixOf(resolveCollectionPrefix(url, PUBLIC))).toBe(
                `tenant-a/videos/${SESSION}`,
            );
        });

        it("ignores a query string or fragment", () => {
            expect(prefixOf(resolveCollectionPrefix(`${HLS}?v=2`, PUBLIC))).toBe(SESSION);
            expect(prefixOf(resolveCollectionPrefix(`${HLS}#top`, PUBLIC))).toBe(SESSION);
        });

        it("takes the playlist filename from the URL rather than assuming one", () => {
            const r = resolveCollectionPrefix(`${PUBLIC}/${SESSION}/index.M3U8`, PUBLIC);
            expect(prefixOf(r)).toBe(SESSION);
            expect("playlist" in r && r.playlist).toBe("index.M3U8");
        });

        it("handles a bucket published at a bare host", () => {
            const base = "https://cdn.example.com";
            expect(
                prefixOf(resolveCollectionPrefix(`${base}/${SESSION}/master.m3u8`, base)),
            ).toBe(SESSION);
        });
    });

    describe("refuses anything it cannot prove it wrote", () => {
        it("refuses a URL in a different bucket", () => {
            const other = "https://someone-elses-cdn.example.com/media";
            expect(refusalOf(resolveCollectionPrefix(`${other}/${SESSION}/master.m3u8`, PUBLIC)))
                .toMatch(/not in this bucket/);
        });

        it("refuses a bucket whose name merely prefixes another", () => {
            // The separator is part of the match, or `…/media` would claim
            // `…/media-archive/<session>/master.m3u8`.
            const url = `${PUBLIC}-archive/${SESSION}/master.m3u8`;
            expect(refusalOf(resolveCollectionPrefix(url, PUBLIC))).toMatch(/not in this bucket/);
        });

        it("refuses a URL that is not an HLS playlist", () => {
            expect(refusalOf(resolveCollectionPrefix(`${PUBLIC}/${SESSION}/`, PUBLIC)))
                .toMatch(/HLS playlist/);
            expect(refusalOf(resolveCollectionPrefix(`${PUBLIC}/${SESSION}/.m3u8`, PUBLIC)))
                .toMatch(/HLS playlist/);
            expect(refusalOf(resolveCollectionPrefix(`${PUBLIC}/${SESSION}/video.mp4`, PUBLIC)))
                .toMatch(/HLS playlist/);
        });

        it("refuses a rendition playlist, whose folder is not the collection", () => {
            expect(
                refusalOf(
                    resolveCollectionPrefix(`${PUBLIC}/${SESSION}/stream/playlist.m3u8`, PUBLIC),
                ),
            ).toMatch(/not a session id/);
        });

        it("refuses the bucket root", () => {
            expect(refusalOf(resolveCollectionPrefix(`${PUBLIC}/master.m3u8`, PUBLIC)))
                .toMatch(/bucket root/);
        });

        it("refuses a path that tries to climb out", () => {
            const url = `${PUBLIC}/../other-tenant/${SESSION}/master.m3u8`;
            expect(refusalOf(resolveCollectionPrefix(url, PUBLIC))).toMatch(/suspicious path/);
        });

        it("refuses a folder that is not a session id", () => {
            // The case the tick box makes possible: hlsUrl is editable, so someone
            // can paste a URL naming a folder shared with other content.
            const url = `${PUBLIC}/shared-videos/master.m3u8`;
            expect(refusalOf(resolveCollectionPrefix(url, PUBLIC))).toMatch(/not a session id/);
        });

        it("refuses when either side is missing", () => {
            expect(refusalOf(resolveCollectionPrefix(undefined, PUBLIC))).toMatch(/no media URL/);
            expect(refusalOf(resolveCollectionPrefix(HLS, undefined))).toMatch(/no public URL/);
            expect(refusalOf(resolveCollectionPrefix("", PUBLIC))).toMatch(/no media URL/);
        });
    });

    it("never returns a prefix with a leading or trailing slash", () => {
        // The caller appends '/' to scope the listing; a stray slash would widen it.
        const prefix = prefixOf(resolveCollectionPrefix(HLS, PUBLIC))!;
        expect(prefix.startsWith("/")).toBe(false);
        expect(prefix.endsWith("/")).toBe(false);
    });
});

describe("deleteMediaCollection", () => {
    const BUCKET = "bucket-media";
    const RELATIVE = `/${SESSION}/master.m3u8`;
    const KEYS = [`${SESSION}/master.m3u8`, `${SESSION}/media/v0_0.m4s`];
    const s3 = { listObjectsUnder: jest.fn(), removeObjects: jest.fn() };

    /** A bucket, plus the Posts and Tags a referrer query would find in it. */
    const stubDb = (documents: object[] = []) =>
        ({
            getDoc: jest.fn().mockResolvedValue({
                docs: [{ _id: BUCKET, publicUrl: PUBLIC, name: "media" }],
            }),
            executeFindQuery: jest.fn().mockResolvedValue({ docs: documents }),
        }) as unknown as DbService;

    const run = (db: DbService, replacedBy?: string, hlsUrl = HLS) =>
        deleteMediaCollection({ hlsUrl } as MediaDto, BUCKET, db, {
            ownerId: "post-1",
            replacedBy,
        });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, "log").mockImplementation(() => {});
        s3.listObjectsUnder.mockResolvedValue(KEYS);
        s3.removeObjects.mockResolvedValue(undefined);
        (S3Service.create as jest.Mock).mockResolvedValue(s3);
    });

    it("removes a collection no other document uses", async () => {
        const warnings = await run(stubDb());

        expect(warnings).toEqual([]);
        expect(s3.removeObjects).toHaveBeenCalledWith(KEYS);
    });

    it("removes the collection when the URL is cleared", async () => {
        await run(stubDb(), "");

        expect(s3.removeObjects).toHaveBeenCalledWith(KEYS);
    });

    it.each([
        ["another playlist in the same folder", `/${SESSION}/index.m3u8`],
        ["the same playlist with a query string", `${HLS}?v=2`],
        ["the relative form of the same URL", RELATIVE],
    ])("keeps the files when the new URL is %s", async (_, replacedBy) => {
        const warnings = await run(stubDb(), replacedBy);

        expect(warnings).toEqual([]);
        expect(s3.removeObjects).not.toHaveBeenCalled();
    });

    it("keeps the files another document still uses", async () => {
        // A duplicated document carries the same media as its source.
        const db = stubDb([{ _id: "post-2", media: { hlsUrl: RELATIVE } }]);

        const warnings = await run(db, `${PUBLIC}/0b2d7c1e-9a41-4d3f-8c55-2f6e1a9b7d10/master.m3u8`);

        expect(warnings.join(" ")).toMatch(/kept because 1 other document/);
        expect(s3.removeObjects).not.toHaveBeenCalled();
    });

    it("does not count the owner, or documents in other folders, as users", async () => {
        const db = stubDb([
            { _id: "post-1", media: { hlsUrl: HLS } },
            { _id: "post-3", media: { hlsUrl: "/0b2d7c1e-9a41-4d3f-8c55-2f6e1a9b7d10/master.m3u8" } },
            { _id: "tag-1" },
        ]);

        await run(db);

        expect(s3.removeObjects).toHaveBeenCalledWith(KEYS);
    });

    it("keeps the files when it cannot check for other users", async () => {
        const db = stubDb();
        (db.executeFindQuery as jest.Mock).mockRejectedValue(new Error("database unavailable"));

        const warnings = await run(db);

        expect(warnings.join(" ")).toMatch(/could not check whether other documents use them/);
        expect(s3.removeObjects).not.toHaveBeenCalled();
    });

    it("says nothing about media hosted elsewhere", async () => {
        const warnings = await run(stubDb(), undefined, "https://www.youtube.com/watch?v=abc");

        expect(warnings).toEqual([]);
        expect(S3Service.create).not.toHaveBeenCalled();
    });
});
