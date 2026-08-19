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
        // The delete path also drops the document's sidecars (ADR 0018).
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
        media: { hlsUrl: HLS, fileCollections: [] },
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

    it("still cascades the delete to the child content documents", async () => {
        // The media work must not displace what the delete path is actually for.
        const db = stubDb();
        await processPostTagDto(deleteRequest(true), saved(), db);

        expect(db.getContentByParentId).toHaveBeenCalledWith("post-1");
    });
});
