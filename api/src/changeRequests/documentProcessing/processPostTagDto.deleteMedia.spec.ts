import processPostTagDto from "./processPostTagDto";
import { deleteMediaCollection } from "./deleteMediaCollection";
import { deleteImage, processImage } from "./processImageDto";
import { processMedia } from "./processMediaDto";
import { DbService } from "../../db/db.service";
import { PostDto } from "../../dto/PostDto";

jest.mock("./deleteMediaCollection", () => ({ deleteMediaCollection: jest.fn() }));
jest.mock("./processImageDto", () => ({ processImage: jest.fn(), deleteImage: jest.fn() }));
jest.mock("./processMediaDto", () => ({ processMedia: jest.fn() }));

/**
 * A database stub, so the one branch under test does not need CouchDB.
 *
 * The delete path returns as soon as it has cascaded to the children, so
 * `getContentByParentId` and `upsertDoc` are all it reaches.
 */
const stubDb = () =>
    ({
        getContentByParentId: jest.fn().mockResolvedValue({ docs: [] }),
        upsertDoc: jest.fn().mockResolvedValue({ id: "x" }),
        getDocs: jest.fn().mockResolvedValue({ docs: [] }),
        getDoc: jest.fn().mockResolvedValue({ docs: [] }),
        // The delete path also drops the document's sidecars (ADR 0019).
        deleteDoc: jest.fn().mockResolvedValue(undefined),
    }) as unknown as DbService;

const HLS = "http://localhost:9000/media/c5829f07-4ba8-42ed-a449-80d83e6c0b53/master.m3u8";

/** The document as saved, which is the authority on where the files are. */
const saved = () =>
    ({
        _id: "post-1",
        type: "post",
        memberOf: ["group-public-content"],
        tags: [],
        publishDateVisible: true,
        postType: "blog",
        mediaBucketId: "bucket-media",
        media: { hlsUrl: HLS },
    }) as unknown as PostDto;

/** The delete request, carrying the user's answer from the confirmation. */
const deleteRequest = (deleteFiles?: boolean) => {
    const doc = saved();
    doc.deleteReq = 1;
    if (deleteFiles !== undefined) doc.media!.deleteFiles = deleteFiles;
    return doc;
};

describe("processPostTagDto — deleting media files from storage", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (deleteMediaCollection as jest.Mock).mockResolvedValue([]);
        (deleteImage as jest.Mock).mockResolvedValue([]);
        (processImage as jest.Mock).mockResolvedValue({ warnings: [] });
        (processMedia as jest.Mock).mockResolvedValue([]);
    });

    it("leaves storage alone when the user did not opt in", async () => {
        // The guarantee that matters most: deleting a document must never remove
        // anyone's video unless they asked for it in the confirmation.
        await processPostTagDto(deleteRequest(), saved(), stubDb());

        expect(deleteMediaCollection).not.toHaveBeenCalled();
    });

    it("leaves storage alone when the box was explicitly unticked", async () => {
        await processPostTagDto(deleteRequest(false), saved(), stubDb());

        expect(deleteMediaCollection).not.toHaveBeenCalled();
    });

    it("deletes the collection when asked", async () => {
        const db = stubDb();
        await processPostTagDto(deleteRequest(true), saved(), db);

        expect(deleteMediaCollection).toHaveBeenCalledWith(
            expect.objectContaining({ hlsUrl: HLS }),
            "bucket-media",
            db,
        );
    });

    it("takes the location from the saved document, not the incoming one", async () => {
        // A hlsUrl edited in the same breath as the delete must not redirect the
        // deletion at something else. Intent comes from the request; the target
        // comes from what was actually saved.
        const incoming = deleteRequest(true);
        incoming.media!.hlsUrl = "http://localhost:9000/media/somewhere-else/master.m3u8";

        await processPostTagDto(incoming, saved(), stubDb());

        expect(deleteMediaCollection).toHaveBeenCalledWith(
            expect.objectContaining({ hlsUrl: HLS }),
            "bucket-media",
            expect.anything(),
        );
    });

    it("does not call it at all for a document with no media", async () => {
        const doc = deleteRequest();
        delete doc.media;

        await processPostTagDto(doc, saved(), stubDb());

        expect(deleteMediaCollection).not.toHaveBeenCalled();
    });

    it("reports what storage could not remove, without failing the delete", async () => {
        (deleteMediaCollection as jest.Mock).mockResolvedValueOnce([
            "Media files were not deleted: bucket is unreachable",
        ]);

        const warnings = await processPostTagDto(deleteRequest(true), saved(), stubDb());

        expect(warnings.some((w) => w.includes("unreachable"))).toBe(true);
    });

    it("says nothing when the media is hosted elsewhere", async () => {
        // Nothing in this bucket to delete, and no instruction to go looking.
        (deleteMediaCollection as jest.Mock).mockResolvedValueOnce([]);
        const incoming = deleteRequest(true);
        incoming.media!.hlsUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
        const saved_ = saved();
        saved_.media!.hlsUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

        const warnings = await processPostTagDto(incoming, saved_, stubDb());

        expect(warnings).toEqual([]);
    });

    it("does not leave the answer on the document", async () => {
        // Stored, it is copied onto every child's parentMedia, and the next delete
        // reads an opt-in the editor never gave.
        const doc = deleteRequest(true);

        await processPostTagDto(doc, saved(), stubDb());

        expect(doc.media).not.toHaveProperty("deleteFiles");
    });

    it("does not leave an unticked answer on the document either", async () => {
        const doc = deleteRequest(false);

        await processPostTagDto(doc, saved(), stubDb());

        expect(doc.media).not.toHaveProperty("deleteFiles");
    });

    it("still cascades the delete to the child content documents", async () => {
        // The media work must not displace what the delete path is actually for.
        const db = stubDb();
        await processPostTagDto(deleteRequest(true), saved(), db);

        expect(db.getContentByParentId).toHaveBeenCalledWith("post-1");
    });
});

describe("processPostTagDto — replacing or clearing the media URL", () => {
    const PUBLIC = "http://localhost:9000/media";
    const RELATIVE = "/c5829f07-4ba8-42ed-a449-80d83e6c0b53/master.m3u8";

    const dbWithBucket = (publicUrl: string | undefined = PUBLIC) => {
        const db = stubDb();
        (db.getDoc as jest.Mock).mockImplementation(async (id: string) =>
            id === "bucket-media" ? { docs: [{ _id: id, publicUrl }] } : { docs: [] },
        );
        return db;
    };

    /** Runs the deferred work the way processChangeRequest does after the write. */
    const save = async (doc: PostDto, prev: PostDto, db: DbService) => {
        const afterCommit = [];
        await processPostTagDto(doc, prev, db, afterCommit);
        expect(deleteMediaCollection).not.toHaveBeenCalled();
        for (const task of afterCommit) await task();
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (deleteMediaCollection as jest.Mock).mockResolvedValue([]);
        (processMedia as jest.Mock).mockResolvedValue([]);
    });

    it("deletes the old collection after the write when the URL changes", async () => {
        const db = dbWithBucket();
        const doc = saved();
        doc.media!.hlsUrl = `${PUBLIC}/0b2d7c1e-9a41-4d3f-8c55-2f6e1a9b7d10/master.m3u8`;

        await save(doc, saved(), db);

        expect(deleteMediaCollection).toHaveBeenCalledWith(
            expect.objectContaining({ hlsUrl: HLS }),
            "bucket-media",
            db,
        );
    });

    it("deletes the old collection when the URL is cleared", async () => {
        const doc = saved();
        doc.media!.hlsUrl = "";

        await save(doc, saved(), dbWithBucket());

        expect(deleteMediaCollection).toHaveBeenCalledTimes(1);
    });

    it("deletes the old collection when the whole media object is removed", async () => {
        const doc = saved();
        delete doc.media;

        await save(doc, saved(), dbWithBucket());

        expect(deleteMediaCollection).toHaveBeenCalledTimes(1);
    });

    it("keeps the files when the URL is unchanged", async () => {
        await save(saved(), saved(), dbWithBucket());

        expect(deleteMediaCollection).not.toHaveBeenCalled();
    });

    it("keeps the files when the same collection is written relative to the bucket", async () => {
        const prev = saved();
        prev.media!.hlsUrl = RELATIVE;

        await save(saved(), prev, dbWithBucket());

        expect(deleteMediaCollection).not.toHaveBeenCalled();
    });

    it("keeps the files when the bucket cannot be read to compare the URLs", async () => {
        const db = stubDb();
        (db.getDoc as jest.Mock).mockImplementation(async (id: string) => {
            if (id === "bucket-media") throw new Error("unreachable");
            return { docs: [] };
        });
        const prev = saved();
        prev.media!.hlsUrl = RELATIVE;

        await save(saved(), prev, db);

        expect(deleteMediaCollection).not.toHaveBeenCalled();
    });

    it("does nothing on a first save", async () => {
        const afterCommit = [];
        await processPostTagDto(saved(), undefined, dbWithBucket(), afterCommit);

        expect(afterCommit).toHaveLength(0);
    });
});
