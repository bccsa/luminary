import processPostTagDto from "./processPostTagDto";
import { migrateMediaCollection } from "./migrateMediaCollection";
import { deleteMediaCollection } from "./deleteMediaCollection";
import { processImage } from "./processImageDto";
import { processMedia } from "./processMediaDto";
import { DbService } from "../../db/db.service";
import { PostDto } from "../../dto/PostDto";

jest.mock("./migrateMediaCollection", () => ({ migrateMediaCollection: jest.fn() }));
jest.mock("./deleteMediaCollection", () => ({ deleteMediaCollection: jest.fn() }));
jest.mock("./processImageDto", () => ({ processImage: jest.fn(), deleteImage: jest.fn() }));
jest.mock("./processMediaDto", () => ({ processMedia: jest.fn() }));

const stubDb = () =>
    ({
        getContentByParentId: jest.fn().mockResolvedValue({ docs: [] }),
        upsertDoc: jest.fn().mockResolvedValue({ id: "x" }),
        getDocs: jest.fn().mockResolvedValue({ docs: [] }),
        getDoc: jest.fn().mockResolvedValue({ docs: [] }),
    }) as unknown as DbService;

const HLS = "http://old.example.com/media/c5829f07-4ba8-42ed-a449-80d83e6c0b53/master.m3u8";

const post = (bucketId: string, hlsUrl = HLS) =>
    ({
        _id: "post-1",
        type: "post",
        memberOf: ["group-public-content"],
        tags: [],
        publishDateVisible: true,
        postType: "blog",
        mediaBucketId: bucketId,
        media: { hlsUrl },
    }) as unknown as PostDto;

describe("processPostTagDto — migrating media between buckets", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (migrateMediaCollection as jest.Mock).mockResolvedValue({ failed: false, warnings: [] });
        (processImage as jest.Mock).mockResolvedValue({ warnings: [] });
        (processMedia as jest.Mock).mockResolvedValue([]);
        (deleteMediaCollection as jest.Mock).mockResolvedValue([]);
    });

    it("migrates when the bucket changes, from the saved URL", async () => {
        const db = stubDb();
        const incoming = post("bucket-new");

        await processPostTagDto(incoming, post("bucket-old"), db);

        expect(migrateMediaCollection).toHaveBeenCalledWith(
            incoming.media,
            HLS,
            "bucket-old",
            "bucket-new",
            db,
        );
    });

    it("does not migrate when the bucket is unchanged", async () => {
        await processPostTagDto(post("bucket-old"), post("bucket-old"), stubDb());

        expect(migrateMediaCollection).not.toHaveBeenCalled();
    });

    it("does not migrate on first save, when there is nothing to move from", async () => {
        await processPostTagDto(post("bucket-new"), undefined, stubDb());

        expect(migrateMediaCollection).not.toHaveBeenCalled();
    });

    it("reverts the bucket when the migration fails, so the files stay reachable", async () => {
        // The invariant: mediaBucketId and hlsUrl must name the same bucket. If the
        // move failed, the files are still in the old one, so the document has to be.
        (migrateMediaCollection as jest.Mock).mockResolvedValue({
            failed: true,
            warnings: ["Media migration failed: connection reset."],
        });
        const incoming = post("bucket-new");

        const warnings = await processPostTagDto(incoming, post("bucket-old"), stubDb());

        expect(incoming.mediaBucketId).toBe("bucket-old");
        expect(warnings.some((w) => w.includes("Reverted to previous bucket"))).toBe(true);
        expect(warnings.some((w) => w.includes("connection reset"))).toBe(true);
    });

    it("keeps the new bucket when the migration succeeded", async () => {
        const incoming = post("bucket-new");

        await processPostTagDto(incoming, post("bucket-old"), stubDb());

        expect(incoming.mediaBucketId).toBe("bucket-new");
    });

    it("still stores the key after migrating", async () => {
        // The migration must not displace what the media path is otherwise for.
        const incoming = post("bucket-new");

        await processPostTagDto(incoming, post("bucket-old"), stubDb());

        // processMedia reads the bucket off the parent (mediaBucketId) rather than
        // taking it as a separate argument.
        expect(processMedia).toHaveBeenCalledWith(
            incoming.media,
            expect.objectContaining({ _id: "post-1", mediaBucketId: "bucket-new" }),
            expect.anything(),
        );
    });

    it("does not migrate on a delete request", async () => {
        // A delete removes files; it does not move them somewhere first.
        const incoming = post("bucket-new");
        incoming.deleteReq = 1;

        await processPostTagDto(incoming, post("bucket-old"), stubDb());

        expect(migrateMediaCollection).not.toHaveBeenCalled();
    });
});
